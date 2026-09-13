import { readFileSync } from 'node:fs';

const drawer = readFileSync(new URL('../src/components/ChatDrawer.tsx', import.meta.url), 'utf8');
const shell = readFileSync(new URL('../src/components/MissionControlShell.tsx', import.meta.url), 'utf8');
const groupGateway = readFileSync(new URL('../src/lib/group-gateway.ts', import.meta.url), 'utf8');

function includes(source: string, value: string, label: string) {
  if (!source.includes(value)) throw new Error(`${label}: missing ${value}`);
}
function excludes(source: string, value: string, label: string) {
  if (source.includes(value)) throw new Error(`${label}: found ${value}`);
}

includes(drawer, "chatMode?: 'general' | 'canonical' | 'task' | 'room'", 'room mode is part of drawer contract');
includes(drawer, 'useGroupRoom', 'room drawer uses group room state');
includes(drawer, '<GroupRoomView', 'room drawer mounts GroupRoomView');
includes(groupGateway, "'groups.send'", 'room composer is backed by groups.send');
includes(groupGateway, 'thread_id', 'room send includes explicit thread_id');
const roomDrawer = drawer.slice(drawer.indexOf('function GroupChatDrawer'));
excludes(roomDrawer, 'useGatewayChat(', 'room mode must not initialize canonical chat');
includes(roomDrawer, 'accessToken: storedToken', 'room drawer forwards the MC token to the MC-owned side effects');
includes(shell, "chatSearchParams.get('chatMode') === 'room'", 'shell routes room mode');
includes(shell, 'chatRoomId', 'shell owns explicit roomId URL state');
includes(shell, "params.delete('roomId')", 'closing room clears roomId');
// The shared room pointer can only move through the retrying claim: the store
// rejects a revisionless claim, and the UI sends no revision on a room switch.
includes(shell, 'claimLastRoomPointer', 'room selection claims the shared pointer with retry');
excludes(shell, 'syncLastRoomToServer', 'shell must not call the non-retrying primitive directly');

console.log('group chat drawer contract tests passed');
