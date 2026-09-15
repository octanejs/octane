# @octanejs/tanstack-ai

[TanStack AI](https://tanstack.com/ai) bindings for the
[Octane](https://github.com/octanejs/octane) UI framework.

This package ports `@tanstack/ai-react@0.24.1` onto Octane while reusing
`@tanstack/ai` and `@tanstack/ai-client` unchanged. The runtime export surface
matches the React adapter, so migration starts by changing the package import:

```ts
// before
import { useChat } from '@tanstack/ai-react'

// after
import { useChat } from '@octanejs/tanstack-ai'
```

Hooks and components are authored as `.tsrx` and compiled by Octane. Use
`tsrx-tsc` to check applications that consume these source modules.

## Install

```bash
npm install @octanejs/tanstack-ai @tanstack/ai @tanstack/ai-client octane
pnpm add @octanejs/tanstack-ai @tanstack/ai @tanstack/ai-client octane
```

## Usage

```tsx
import { useState } from 'octane'
import { useChat } from '@octanejs/tanstack-ai'

export function Chat() @{
  const [input, setInput] = useState('')
  const chat = useChat({
    fetcher: myFetcher,
  })

  <div>
    @for (const message of chat.messages; key message.id) {
      <p>
        {(message.role +
          ': ' +
          message.parts
            .map((part) => (part.type === 'text' ? part.content : ''))
            .join('')) as string}
      </p>
    }
    <input
      value={input}
      onInput={(event) => setInput(event.currentTarget.value)}
    />
    <button
      onClick={() => {
        void chat.sendMessage(input)
        setInput('')
      }}
    >
      Send
    </button>
  </div>
}
```

`useChat` has no input state of its own — hold the text box value in a local
`useState` and pass it to `sendMessage`. Note the `onInput` handler: Octane
drives text controls per keystroke through the native `input` event, not a
synthetic `onChange`.

## API

The root entry includes chat and typed hook factories, realtime, generation,
media, transcription, summarization, recording, BYOK, WebMCP tools, and the MCP
bridge. It re-exports the upstream adapter's framework-neutral transport,
persistence, client configuration, and message types unchanged.

`@octanejs/tanstack-ai/ui` provides `createChatUI`, context and hook factories,
`Chat`, `ChatMessages`, `ChatMessage`, `ChatInput`, `ToolApproval`, `TextPart`,
and `ThinkingPart`. `TextPart` renders Markdown with `@octanejs/markdown`.

`@octanejs/tanstack-ai/mcp-apps` provides `MCPAppResource`. Supply the resource
HTML, a trusted sandbox proxy URL, and an optional MCP bridge, as for the
upstream component. The host uses the framework-neutral MCP Apps SDK and tears
down its message transport on unmount.

Server rendering through `octane/server` supports initial chat snapshots and
chat widgets. Hydration adopts their server-rendered DOM.

## Migration from 0.17

Use `threadId` to identify a conversation. The current client queues concurrent
messages by default; set `queue: 'drop'` to retain the previous drop behavior.
The binding now includes persistence and interrupt-resume APIs from the current
AI client, as well as both UI subpaths.

## Octane behavior

- Octane uses native input events for built-in text controls; the public ChatInput render-prop callback retains its upstream onChange name.
- Octane has no StrictMode double-invoke and always provides useId.
- TanStack AI Devtools identifies this binding as framework: octane.
- Realtime reconnects and token refreshes use the latest getToken and adapter, and onStatusChange calls the latest supplied callback.
- Changing useChat connection or fetcher preserves the ChatClient and conversation. The replacement transport is applied before the next explicit idle sendMessage, append, or reload, preserving in-flight requests and hydration resumes.
- MCPAppResource uses an authored Octane host with the framework-neutral MCP Apps SDK. The React-only @mcp-ui/client is used solely as a differential test oracle.

## Verification

All 235 registrations from the pinned upstream suite run unchanged and as
Octane adaptations: 218 client and 17 server registrations. Separate strict
type lanes check all 25 upstream type cases. Published declaration probes cover
all 123 exports across the three entry points.

Differential tests compare streamed chat and the actual MCP Apps message
protocol against `@tanstack/ai-react@0.24.1`. Native integration tests exercise
input, portals, suspension, errors, hydration, DOM identity, and teardown.
The exact inventories and source mapping are in `audit/react-parity.json` and
`audit/crosswalk.json` in the repository. The generated
[bindings status table](../../docs/bindings-status.md) reads
[`status.json`](./status.json).

## License

MIT. Contains source derived from
[TanStack AI](https://github.com/TanStack/ai), adapted for Octane.
