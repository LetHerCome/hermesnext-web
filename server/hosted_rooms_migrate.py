#!/usr/bin/env python3
"""Migrate hosted_room* coordination tables from state.db to shared-state.db.

Context
-------
`gateway.hosted_rooms.default_db_path()` was redirected from `<home>/state.db` to
`<root>/shared-state.db` (commit 0e422e0ece, "isolate hosted-room state in
shared-state.db") so that profile gateways stop opening the master session store
writable. The change shipped WITHOUT a data migration, so every room created
before the gateway restart lives in a file the gateway no longer reads: the UI
asks for a persisted last-room id, `groups.state` cannot find it, and the poll
raises `RoomNotFoundError: hosted room not found` every 5s.

What this does
--------------
Copies every hosted_room* table from SOURCE (state.db) into DEST
(shared-state.db), creating the two driver tables if DEST lacks them (the
isolation commit only created the room/policy/event tables there — the driver
tables are created lazily by the driver module).

`hosted_room_driver_leases` rows are deliberately NOT copied: a lease is a
liveness record holding a process_generation and an expiry, refreshed every
~15s by the owning gateway. Copying a dead process's lease would import a stale
owner; the driver takes a fresh lease when it claims the room, exactly as it
does for a newly created room.

SAFETY
------
* SOURCE is opened read-only and never written.
* The whole copy is one IMMEDIATE transaction; any error rolls back.
* Idempotent: rows already present in DEST are left alone (INSERT OR IGNORE).
* Verifies counts and FK integrity before committing.

Usage: hosted_rooms_migrate.py [--dry-run]
"""
from __future__ import annotations

import argparse
import sqlite3
import sys
from pathlib import Path

SOURCE = Path.home() / ".hermes" / "state.db"
DEST = Path.home() / ".hermes" / "shared-state.db"

# Parent-first order so foreign keys resolve as rows land.
TABLE_ORDER = (
    "hosted_rooms",
    "hosted_room_retired_ids",
    "hosted_room_revoked_grants",
    "hosted_room_events",
    "hosted_room_links",
    "hosted_room_peer_reservations",
    "hosted_room_policy_cursors",
    "hosted_room_policy_threads",
    "hosted_room_policy_events",
    "hosted_room_policy_watermarks",
    "hosted_room_policy_publications",
    "hosted_room_policy_transcript",
    "hosted_room_policy_transcript_state",
    "hosted_room_remote_runs",
    "hosted_room_driver_tasks",
)
# Liveness records: recreated by the driver, never imported.
SKIPPED_TABLES = ("hosted_room_driver_leases",)

# Canonical DDL from gateway/hosted_room_driver.py::_initialize_schema. DEST has
# these tables only when the driver has already run against it.
DRIVER_DDL = (
    """CREATE TABLE IF NOT EXISTS hosted_room_driver_leases (
            room_id TEXT PRIMARY KEY, gateway_id TEXT NOT NULL,
            authority_epoch INTEGER NOT NULL CHECK (authority_epoch >= 1), process_generation TEXT NOT NULL,
            lease_generation INTEGER NOT NULL CHECK (lease_generation >= 1),
            expires_at REAL NOT NULL, acquired_at REAL NOT NULL, updated_at REAL NOT NULL, released_at REAL,
            FOREIGN KEY (room_id) REFERENCES hosted_rooms(room_id))""",
    """CREATE TABLE IF NOT EXISTS hosted_room_driver_tasks (
            room_id TEXT NOT NULL, task_id TEXT NOT NULL, thread_id TEXT NOT NULL, turn_id TEXT NOT NULL,
            source_event_seq INTEGER NOT NULL CHECK (source_event_seq >= 1),
            payload_json TEXT NOT NULL, payload_digest TEXT NOT NULL,
            status TEXT NOT NULL CHECK (status IN (
                'queued', 'running', 'settled', 'failed', 'cancelled', 'indeterminate', 'deferred', 'stopping')),
            execution_generation INTEGER NOT NULL DEFAULT 0 CHECK (execution_generation >= 0),
            cancel_generation INTEGER NOT NULL DEFAULT 0 CHECK (cancel_generation >= 0),
            run_gateway_id TEXT, run_process_generation TEXT, run_lease_generation INTEGER, cancel_id TEXT,
            settlement_id TEXT, settlement_status TEXT, result_json TEXT, created_at REAL NOT NULL,
            updated_at REAL NOT NULL, started_at REAL, terminal_at REAL, indeterminate_at REAL,
            PRIMARY KEY (room_id, task_id), UNIQUE (room_id, thread_id, turn_id),
            FOREIGN KEY (room_id) REFERENCES hosted_rooms(room_id))""",
    """CREATE INDEX IF NOT EXISTS idx_hosted_room_driver_tasks_status
           ON hosted_room_driver_tasks(room_id, status, source_event_seq, created_at, task_id)""",
)


def columns(conn: sqlite3.Connection, table: str) -> list[str]:
    return [row[1] for row in conn.execute(f"PRAGMA table_info({table})")]


def count(conn: sqlite3.Connection, table: str) -> int:
    return conn.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]


def migrate(source: Path, dest: Path, dry_run: bool = False) -> int:
    if not source.is_file():
        print(f"FAIL: source missing: {source}", file=sys.stderr)
        return 1
    if not dest.is_file():
        print(f"FAIL: destination missing: {dest}", file=sys.stderr)
        return 1

    # Read-only source: never opened writable, so a copy can never corrupt it.
    src = sqlite3.connect(f"file:{source}?mode=ro", uri=True)
    dst = sqlite3.connect(dest)

    # DEST may be a different (newer) schema version; refuse rather than guess.
    for table in TABLE_ORDER:
        src_cols = columns(src, table)
        dst_cols = columns(dst, table)
        if not src_cols:
            print(f"FAIL: source lacks {table}", file=sys.stderr)
            return 1
        if not dst_cols:
            print(f"    creating {table} in destination (lazily-created driver table)")
        elif src_cols != dst_cols:
            print(f"FAIL: column mismatch on {table}\n  src: {src_cols}\n  dst: {dst_cols}", file=sys.stderr)
            return 1

    planned = {t: count(src, t) for t in TABLE_ORDER}
    print("=== rows to copy (source -> destination) ===")
    for table in TABLE_ORDER:
        print(f"  {table:<42} {planned[table]:>5}  (dest has {count(dst, table) if columns(dst, table) else 'n/a'})")
    for table in SKIPPED_TABLES:
        print(f"  {table:<42} {count(src, table):>5}  SKIPPED (liveness record, driver recreates)")

    if dry_run:
        print("\n--dry-run: nothing written.")
        src.close()
        dst.close()
        return 0

    try:
        dst.execute("PRAGMA foreign_keys=OFF")
        dst.execute("BEGIN IMMEDIATE")
        for ddl in DRIVER_DDL:
            dst.execute(ddl)

        inserted = {}
        for table in TABLE_ORDER:
            cols = columns(dst, table)
            col_list = ", ".join(cols)
            placeholders = ", ".join("?" for _ in cols)
            rows = src.execute(f"SELECT {col_list} FROM {table}").fetchall()
            before = count(dst, table)
            dst.executemany(
                f"INSERT OR IGNORE INTO {table} ({col_list}) VALUES ({placeholders})", rows)
            inserted[table] = count(dst, table) - before

        print("\n=== inserted ===")
        for table in TABLE_ORDER:
            print(f"  {table:<42} +{inserted[table]:>4}  (now {count(dst, table)})")

        # Verify before committing: nothing may be lost or dangling.
        for table in TABLE_ORDER:
            if table == "hosted_room_retired_ids":
                continue  # retired ids are a superset tombstone, not a 1:1 copy
            if count(dst, table) < planned[table]:
                raise RuntimeError(f"verification failed: {table} dest={count(dst, table)} < planned={planned[table]}")
        dangling = dst.execute("PRAGMA foreign_key_check").fetchall()
        if dangling:
            raise RuntimeError(f"verification failed: {len(dangling)} dangling FK rows: {dangling[:5]}")

        dst.execute("COMMIT")
        print("\nOK: committed, FK check clean.")
    except Exception as exc:  # noqa: BLE001 - roll back and report
        dst.execute("ROLLBACK")
        print(f"\nFAIL: rolled back: {type(exc).__name__}: {exc}", file=sys.stderr)
        return 1
    finally:
        src.close()
        dst.close()
    return 0


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--source", type=Path, default=SOURCE)
    ap.add_argument("--dest", type=Path, default=DEST)
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()
    print(f"source: {args.source}\ndest:   {args.dest}\n")
    return migrate(args.source, args.dest, args.dry_run)


if __name__ == "__main__":
    raise SystemExit(main())
