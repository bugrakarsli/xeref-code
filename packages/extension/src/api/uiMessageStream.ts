/**
 * Parser for the Vercel AI SDK "UI message stream" protocol that
 * /api/code/chat serves via streamText().toUIMessageStreamResponse().
 *
 * Wire format: Server-Sent Events, one JSON chunk per frame —
 * `data: <json>\n\n` — terminated by a literal `data: [DONE]\n\n`. Chunks
 * can split across stream reads, so frames are buffered until a `\n\n`
 * boundary is seen before parsing.
 *
 * Only the subset needed to render plain assistant text plus a complete
 * tool call is converted to a StreamEvent. tool-input-start/tool-input-delta
 * (the streaming-input-build-up chunks that precede tool-input-available)
 * are intentionally ignored — only the complete tool-input-available chunk
 * is actionable, so there's nothing useful to buffer from the partial ones
 * for this client. Every other chunk type (reasoning, sources, files,
 * custom data-* parts, step/message-metadata markers) is also intentionally
 * ignored — this client doesn't render them yet, and a forward-compatible
 * parser must not throw on chunk types it doesn't know about.
 */

export type StreamEvent =
  | { type: 'message-start'; messageId?: string }
  | { type: 'text-delta'; id: string; delta: string }
  | { type: 'tool-call'; toolCallId: string; toolName: string; input: unknown }
  | { type: 'message-done'; finishReason?: string }
  | { type: 'error'; message: string };

interface RawChunk {
  type?: string;
  [key: string]: unknown;
}

export async function* parseUIMessageStream(
  body: ReadableStream<Uint8Array>
): AsyncGenerator<StreamEvent> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let separatorIndex: number;
      while ((separatorIndex = buffer.indexOf('\n\n')) !== -1) {
        const frame = buffer.slice(0, separatorIndex);
        buffer = buffer.slice(separatorIndex + 2);
        const event = toStreamEvent(frame);
        if (event) yield event;
      }
    }
  } finally {
    reader.releaseLock();
  }
}

function toStreamEvent(frame: string): StreamEvent | undefined {
  const dataLine = frame.split('\n').find((line) => line.startsWith('data:'));
  if (!dataLine) return undefined;

  const payload = dataLine.slice(5).trim();
  if (payload === '[DONE]') return undefined;

  let chunk: RawChunk;
  try {
    chunk = JSON.parse(payload);
  } catch {
    return undefined; // malformed frame — skip rather than crash the stream
  }

  switch (chunk.type) {
    case 'start':
      return { type: 'message-start', messageId: chunk.messageId as string | undefined };
    case 'text-delta':
      return { type: 'text-delta', id: chunk.id as string, delta: chunk.delta as string };
    case 'tool-input-available':
      return {
        type: 'tool-call',
        toolCallId: chunk.toolCallId as string,
        toolName: chunk.toolName as string,
        input: chunk.input,
      };
    case 'finish':
      return { type: 'message-done', finishReason: chunk.finishReason as string | undefined };
    case 'error':
      return { type: 'error', message: chunk.errorText as string };
    default:
      // text-start/text-end, tool-input-start/tool-input-delta, start-step/
      // finish-step, abort, message-metadata, tool-output-*/
      // tool-approval-request, reasoning-*, source-url/source-document,
      // file, data-* — not rendered yet.
      return undefined;
  }
}
