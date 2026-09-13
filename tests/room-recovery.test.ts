/**
 * Room-recovery contracts.
 *
 * A room the gateway no longer knows about (disbanded + pruned, or left behind
 * by the coordination-store move to shared-state.db) made `groups.state` reject
 * on every 5s poll, and the rejection was unhandled: the drawer stayed pinned to
 * the dead id forever. These are behaviour contracts -- they CALL the logic
 * rather than asserting on source text, so a subtly mis-wired call site fails
 * them instead of passing.
 */
import { isRoomNotFound, pickFallbackRoom } from '../src/lib/room-recovery.ts';

function assertEqual<T>(actual: T, expected: T, label: string) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}
function assertTrue(value: boolean, label: string) {
  if (!value) throw new Error(`${label}: expected true, got false`);
}

// --- what counts as "room gone" --------------------------------------------
// The gateway forwards RoomNotFoundError's own message through the groups.state
// error envelope, so these exact strings are what the client sees.
assertTrue(isRoomNotFound(new Error('hosted room not found')), 'exact gateway message');
assertTrue(
  isRoomNotFound(new Error('Group Chat history expired; room_id remains permanently retired')),
  'retired-room message',
);
assertTrue(isRoomNotFound({ message: 'hosted room not found' }), 'non-Error rejection with the gateway message');

// Transport failures must NOT be classified as gone: they are transient and have
// to keep surfacing, otherwise a dead gateway is silently hidden behind a room
// switch.
assertEqual(isRoomNotFound(new Error('Gateway request timed out: groups.state')), false, 'timeout is not a missing room');
assertEqual(isRoomNotFound(new Error('Gateway connection closed during groups.state.')), false, 'closed socket is not a missing room');
assertEqual(isRoomNotFound(new Error('Could not connect to the gateway for groups.state.')), false, 'connect failure is not a missing room');

// --- which room to open instead --------------------------------------------
const rooms = [{ id: 'mc-dead' }, { id: 'mc-live' }, { id: 'mc-other' }];
assertEqual(pickFallbackRoom(rooms, 'mc-dead')?.id, 'mc-live', 'picks the first room that is not the failed one');
assertEqual(pickFallbackRoom([{ id: 'mc-dead' }], 'mc-dead'), null, 'no fallback when the dead room is the only one');
assertEqual(pickFallbackRoom([], 'mc-dead'), null, 'no fallback when there are no rooms');
assertEqual(
  pickFallbackRoom([{ id: 'mc-a' }, { id: 'mc-b' }], 'mc-absent')?.id,
  'mc-a',
  'an unknown failed id still yields a usable room',
);

// A room that is still alive must never be swapped out.
assertEqual(pickFallbackRoom(rooms, 'mc-other')?.id, 'mc-dead', 'does not return the failed room itself');

console.log('room recovery tests passed');
