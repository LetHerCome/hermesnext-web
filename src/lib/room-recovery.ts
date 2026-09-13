/**
 * Room-recovery decisions, kept pure and dependency-free so they can be tested
 * by calling them (the repo's older tests assert on source text, which passes
 * when the wiring is subtly wrong -- these are behaviour contracts instead).
 */

/** The gateway's `RoomNotFoundError` message, forwarded verbatim through the
 *  `groups.state` error envelope (room_code 4114 with `{"reason"}`). A retired
 *  room reports its own distinct message. */
const ROOM_GONE_PATTERNS = [/hosted room not found/i, /history expired/i, /room not found/i];

/** Did the gateway reject because this room no longer exists?
 *
 *  Distinguishing this from a transport failure matters: a missing room is
 *  permanent (retrying the same id every poll tick never recovers) while a
 *  timeout or closed socket is transient and must keep surfacing as a
 *  retryable error rather than being silently swallowed. */
export function isRoomNotFound(cause: unknown): boolean {
  const message = cause && typeof cause === 'object' && 'message' in cause
    ? String((cause as { message: unknown }).message)
    : String(cause);
  return ROOM_GONE_PATTERNS.some((pattern) => pattern.test(message));
}

/** Choose which room to open after the selected one turned out to be gone.
 *
 *  Returns null when there is nothing else to open, which means "show the empty
 *  picker" rather than "keep retrying a dead id". */
export function pickFallbackRoom<T extends { id: string }>(rooms: readonly T[], failedRoomId: string): T | null {
  return rooms.find((room) => room.id !== failedRoomId) ?? null;
}
