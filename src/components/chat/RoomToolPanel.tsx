import type { RoomToolTrace } from '../../lib/room-tools';
import { ChatMessageCard } from '../chat-messages';
import { ToolRunSummary } from './ToolRunSummary';
import { traceToChatMessage } from '../../lib/room-tool-message';

/**
 * Per-turn tool strip for room transcripts, rendered right above a member's
 * final answer (between the user message that started the turn and the bot
 * reply). Thin wrapper around the shared ToolRunSummary: collapsed rail with
 * the call count + member handle, expansion renders the canonical ToolMessage
 * cards inline into the transcript.
 *
 * The trace→message mapping lives in `lib/room-tool-message` so its rendering
 * contract (each payload block exactly once) is directly testable.
 */
export function RoomToolStrip({
  tools,
  memberHandle,
  expanded,
  onToggle,
}: {
  tools: RoomToolTrace[];
  memberHandle: string;
  expanded: boolean;
  onToggle: () => void;
}) {
  const toolCount = tools.filter((trace) => trace.kind !== 'reasoning').length;
  const reasoningCount = tools.filter((trace) => trace.kind === 'reasoning').length;
  return (
    <ToolRunSummary count={toolCount} reasoningCount={reasoningCount} label={memberHandle} expanded={expanded} onToggle={onToggle}>
      {tools.map((trace) => {
        const message = traceToChatMessage(trace);
        return <ChatMessageCard key={message.id} message={message} mentionHandles={[]} />;
      })}
    </ToolRunSummary>
  );
}
