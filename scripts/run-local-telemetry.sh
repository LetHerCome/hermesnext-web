#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# Source env file so MISSION_CONTROL_TOKEN is available.
# shellcheck disable=SC1091 # path is runtime-computed via SCRIPT_DIR
source "$SCRIPT_DIR/lib/env.sh"
load_mission_control_env

# Profile-aware Hermes home (mirrors server/hermes_paths.py, issue #12):
# HERMES_HOME env, then the sticky active profile, then ~/.hermes.
HERMES_ROOT="$(resolve_hermes_home)"

# The telemetry sidecar now always starts the terminal WebSocket bridge, so
# both dependencies must be available in the interpreter that runs it. Check
# the Python version too: hermes_state.py uses Python 3.10+ syntax.
runtime_ready() {
  "$1" -c 'import sys, psutil, websockets; raise SystemExit(sys.version_info < (3, 10))' >/dev/null 2>&1
}

# Prefer the core venv because it contains the Hermes state modules. Fall back
# to system python3 only when that interpreter also has the complete runtime.
# Windows venvs use Scripts/python.exe instead of bin/python, and Windows
# python.org installs typically expose only `python`, not `python3`.
CORE_PYTHON="$HERMES_ROOT/hermes-agent/venv/bin/python"
CORE_PYTHON_WIN="$HERMES_ROOT/hermes-agent/venv/Scripts/python.exe"
if [[ -x "$CORE_PYTHON" ]] && runtime_ready "$CORE_PYTHON"; then
  PYTHON_BIN="$CORE_PYTHON"
elif [[ -x "$CORE_PYTHON_WIN" ]] && runtime_ready "$CORE_PYTHON_WIN"; then
  PYTHON_BIN="$CORE_PYTHON_WIN"
elif command -v python3 >/dev/null 2>&1 && runtime_ready "$(command -v python3)"; then
  PYTHON_BIN="$(command -v python3)"
elif command -v python >/dev/null 2>&1 && runtime_ready "$(command -v python)"; then
  PYTHON_BIN="$(command -v python)"
else
  echo "[mission-control-local-telemetry] Python 3.10+, psutil, or websockets is missing." >&2
  echo "Install the base sidecar dependencies into the interpreter that will run it:" >&2
  echo "  $CORE_PYTHON -m pip install -r $SCRIPT_DIR/../server/requirements.txt" >&2
  echo "  python3 -m pip install -r $SCRIPT_DIR/../server/requirements.txt" >&2
  exit 1
fi

# hermes_state.py lives in the core dir, not on the default sys.path when the
# server runs with cwd=apps/mission-control. Export the core dir so the
# telemetry server can open state.db (otherwise it falls back to the stale
# sessions.json index and shows ~11 sessions instead of the real count).
export PYTHONPATH="${PYTHONPATH:+$PYTHONPATH:}$HERMES_ROOT/hermes-agent"
# The server resolves Hermes state through the same profile-aware home.
export HERMES_HOME="${HERMES_HOME:-$HERMES_ROOT}"

# Curate (BDH candidate curation) — opt-in via the external env file. The public
# repo default stays OFF (MC_ENABLE_BDH_CURATOR unset → disabled).
[ -n "${MC_ENABLE_BDH_CURATOR:-}" ] && export MC_ENABLE_BDH_CURATOR

exec "$PYTHON_BIN" "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/server/local_telemetry_server.py"
