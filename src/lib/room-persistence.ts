/**
 * Shared cross-device last-room pointer, mirror of chat-persistence.ts.
 *
 * Desktop and mobile run the same Mission Control UI against the same
 * local API, so the "last room" must be device-independent like the last
 * chat: the telemetry store (/api/local/room/last) keeps a revisioned
 * pointer and whichever device selects a room last wins for every device.
 * localStorage is only a synchronous fallback for the first paint; the
 * server stays canonical.
 */

export type ServerLastRoom = {
  roomId: string;
  roomName?: string | null;
  revision: number;
  updatedAt?: number | null;
};

export type LastRoomClaimResult = {
  accepted: boolean;
  conflict: boolean;
  lastRoom: ServerLastRoom | null;
};

const LAST_ROOM_KEY = 'mission-control-last-room';

export function readLocalLastRoom(): string | null {
  try {
    return localStorage.getItem(LAST_ROOM_KEY);
  } catch {
    return null;
  }
}

export function writeLocalLastRoom(roomId: string | null): void {
  try {
    if (roomId) localStorage.setItem(LAST_ROOM_KEY, roomId);
    else localStorage.removeItem(LAST_ROOM_KEY);
  } catch {
    /* storage unavailable */
  }
}

function parseLastRoomPayload(value: unknown): ServerLastRoom | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as { lastRoom?: unknown };
  const raw = record.lastRoom as { roomId?: unknown; roomName?: unknown; revision?: unknown; updatedAt?: unknown } | null | undefined;
  if (!raw || typeof raw !== 'object' || !raw.roomId || typeof raw.roomId !== 'string') return null;
  return {
    roomId: raw.roomId,
    roomName: typeof raw.roomName === 'string' ? raw.roomName : null,
    revision: typeof raw.revision === 'number' ? raw.revision : 1,
    updatedAt: typeof raw.updatedAt === 'number' ? raw.updatedAt : null,
  };
}

function buildLastRoomClaimPayload(
  roomId: string,
  roomName: string | null,
  expectedRevision: number | null,
): Record<string, unknown> {
  const payload: Record<string, unknown> = { roomId };
  if (roomName) payload.roomName = roomName;
  if (expectedRevision !== null) payload.expectedRevision = expectedRevision;
  return payload;
}

/** Claim the shared room pointer with CAS; 409 = canonical pointer changed. */
export async function syncLastRoomToServer(
  roomId: string,
  roomName: string | null,
  storedToken: string,
  expectedRevision: number | null = null,
): Promise<LastRoomClaimResult> {
  if (!roomId || !roomId.trim()) return { accepted: false, conflict: false, lastRoom: null };
  try {
    const body = buildLastRoomClaimPayload(roomId, roomName, expectedRevision);
    const res = await fetch('/api/local/room/last', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(storedToken ? { Authorization: `Bearer ${storedToken}` } : {}),
      },
      body: JSON.stringify(body),
    });
    const payload = await res.json().catch(() => null);
    const lastRoom = parseLastRoomPayload(payload);
    return { accepted: res.ok, conflict: res.status === 409, lastRoom };
  } catch {
    return { accepted: false, conflict: false, lastRoom: null };
  }
}

/**
 * How many times a claim may be re-issued after a 409 before giving up. The
 * retry is what makes "last writer wins" actually work: the store rejects a
 * missing/stale revision on purpose, so the first attempt of every room switch
 * is expected to conflict once a pointer already exists.
 */
const MAX_CLAIM_ATTEMPTS = 3;

/**
 * Claim the shared room pointer with a bounded conflict retry.
 *
 * `syncLastRoomToServer` alone cannot move the pointer: the store refuses a
 * claim whose `expectedRevision` does not match the canonical revision, and the
 * caller legitimately sends `null` whenever it switches to a room other than
 * the one it last saw. Without the retry the pointer is frozen at the first
 * room ever selected and every device keeps adopting it. On 409 the canonical
 * revision is adopted and the claim is re-issued, exactly like the last-chat
 * pointer does.
 */
export async function claimLastRoomPointer(
  roomId: string,
  roomName: string | null,
  storedToken: string,
  expectedRevision: number | null,
): Promise<LastRoomClaimResult> {
  let expected = expectedRevision;
  let result = await syncLastRoomToServer(roomId, roomName, storedToken, expected);
  for (let attempt = 1; attempt < MAX_CLAIM_ATTEMPTS && !result.accepted; attempt += 1) {
    if (!result.conflict || !result.lastRoom) break;
    expected = result.lastRoom.revision;
    result = await syncLastRoomToServer(roomId, roomName, storedToken, expected);
  }
  return result;
}

export async function fetchServerLastRoom(storedToken: string, signal?: AbortSignal): Promise<ServerLastRoom | null> {
  try {
    const res = await fetch('/api/local/room/last', {
      headers: storedToken ? { Authorization: `Bearer ${storedToken}` } : {},
      ...(signal ? { signal } : {}),
    });
    if (!res.ok) return null;
    const data = await res.json() as { lastRoom?: unknown };
    return parseLastRoomPayload(data);
  } catch {
    return null;
  }
}
