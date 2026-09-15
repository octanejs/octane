import { createRoot } from 'octane';
import { Chat, ChatInput, ChatMessages, ChatMessage, TextPart } from '@octanejs/tanstack-ai/ui';
import { MCPAppResource } from '@octanejs/tanstack-ai/mcp-apps';

const connection = {
  async *connect() {
    await new Promise<void>((resolve) => { (window as any).releaseReply = resolve; });
    yield { type: 'TEXT_MESSAGE_CONTENT', messageId: 'reply', delta: 'Received', content: 'Received', timestamp: 0 };
    yield { type: 'RUN_FINISHED', threadId: 'browser', runId: 'reply', timestamp: 0, finishReason: 'stop' };
  },
};
function Markdown({ content }) @{ <TextPart content={content} /> }
function BrowserChat() @{
  <Chat connection={connection} initialMessages={[
    { id: 'welcome', role: 'assistant', parts: [{ type: 'text', content: '**Welcome**' }] },
  ]}>
    <ChatMessages>{(message) => <ChatMessage message={message} textPartRenderer={({ content }) => <Markdown content={content} />} />}</ChatMessages>
    <ChatInput placeholder="Message" />
  </Chat>
}
export function mount(target: HTMLElement) {
  const root = createRoot(target);
  root.render(BrowserChat);
  return root;
}
// Retain the optional public entry point in the bundle's import-closure check.
export { MCPAppResource };
