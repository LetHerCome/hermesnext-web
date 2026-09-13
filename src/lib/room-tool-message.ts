/**
 * Room tool-trace → ChatMessage mapping, kept free of React so the rendering
 * contracts can be asserted by calling them.
 *
 * A room trace is a SETTLED, backend-collected record (telemetry reads it back
 * from the member profiles' sessions), unlike the canonical chat path where a
 * tool message streams a live preview into `detail` and later settles into
 * `output`. Mirroring that shape here meant filling both fields from the same
 * `trace.output`, and ToolMessage renders both -- so every tool card printed its
 * payload twice, once under "Live output" and once under "Output".
 */
import type { ChatMessage } from './chat-protocol';
import type { RoomToolTrace } from './room-tools';

export function traceToChatMessage(trace: RoomToolTrace): ChatMessage {
  const text = trace.output ?? trace.toolInput ?? '';
  const attribution = trace.memberHandle
    ? { handle: trace.memberHandle, displayName: trace.memberDisplayName ?? trace.memberHandle }
    : undefined;

  if (trace.kind === 'reasoning') {
    // Reasoning renders from `text` alone; `detail` here is also redundant.
    return {
      id: `room-reasoning-${trace.memberHandle ?? 'member'}-${trace.timestamp ?? 0}-${trace.output?.slice(0, 32) ?? ''}`,
      role: 'assistant',
      kind: 'reasoning',
      text,
      status: 'complete',
      createdAt: typeof trace.timestamp === 'number' ? trace.timestamp * 1000 : null,
      attribution,
    };
  }

  return {
    id: `room-tool-${trace.memberHandle ?? 'member'}-${trace.timestamp ?? 0}-${trace.toolName}`,
    role: 'tool',
    kind: 'tool',
    text,
    status: trace.status === 'error' ? 'error' : 'complete',
    createdAt: typeof trace.timestamp === 'number' ? trace.timestamp * 1000 : null,
    toolId: undefined,
    toolName: trace.toolName,
    toolInput: trace.toolInput,
    output: trace.output,
    durationS: trace.durationS ?? undefined,
    attribution,
  };
}

/** The tool-card payload blocks ToolMessage will actually render for `message`.
 *
 *  ToolMessage shows "Input" when `toolInput || text` is present, "Live output"
 *  when `detail` is present, and "Output" when `output` is present. A settled
 *  room trace must produce each distinct payload once.
 *
 *  Only `kind: 'tool'` reaches ToolMessage: reasoning renders through the plain
 *  message card, driven by `text`. */
export function renderedToolPayloads(message: ChatMessage): string[] {
  if (message.kind !== 'tool') return [];
  const blocks: string[] = [];
  if (message.toolInput || message.text) blocks.push('Input');
  if (message.detail) blocks.push('Live output');
  if (message.output) blocks.push('Output');
  return blocks;
}
