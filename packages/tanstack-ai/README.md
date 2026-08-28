# @octanejs/tanstack-ai

[TanStack AI](https://tanstack.com/ai) bindings for the
[Octane](https://github.com/octanejs/octane) UI framework.

This package ports `@tanstack/ai-react@0.17.0` onto Octane while reusing
`@tanstack/ai` and `@tanstack/ai-client` unchanged. The runtime export surface
matches the React adapter, so migration starts by changing the package import:

```ts
// before
import { useChat } from '@tanstack/ai-react'

// after
import { useChat } from '@octanejs/tanstack-ai'
```

The renderer-bearing hook modules are authored as `.tsrx` and compiled by
Octane. Matching `.tsrx.d.ts` companions are checked declaration emits of
those implementations, preserving the complete generic surface for
TypeScript consumers.

## Install

```bash
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

The adapter includes `useChat`, `useRealtimeChat`, `useMcpAppBridge`,
`useGeneration`, `useGenerateImage`, `useGenerateAudio`, `useGenerateSpeech`,
`useGenerateVideo`, `useTranscription`, `useSummarize`, and
`useAudioRecorder`. It also re-exports all 30 `@tanstack/ai-client`
convenience helpers and types (`fetchServerSentEvents`, `fetchHttpStream`,
`xhrServerSentEvents`, `xhrHttpStream`, `stream`, `rpcStream`,
`createChatClientOptions`, `createMcpAppBridge`, and their associated types)
unchanged, mirroring the upstream `@tanstack/ai-react` index.

Server rendering through `octane/server` is supported. `useChat` renders its
initial message snapshot without browser-only setup.

## Divergences from `@tanstack/ai-react`

- The `./mcp-apps` subpath and its `MCPAppResource` component are not ported:
  they render `AppRenderer` from the React-only `@mcp-ui/client`, which has no
  Octane equivalent. The framework-agnostic `useMcpAppBridge` hook is ported
  and available on the main entry.
- Octane uses native events: text/file/recorder inputs drive updates via
  `onInput`; there is no synthetic `onChange` layer.
- Octane has no StrictMode double-invoke and always provides `useId`, so no
  random-id fallback is needed.
- Realtime reconnects and token refreshes use the latest `getToken` and adapter
  supplied to the hook; upstream captures the first render's callbacks.
- The declared realtime `onStatusChange` callback is invoked alongside the
  hook's state update; upstream 0.17.0 currently drops the external callback.
- One upstream `useChat` test case ("auto-resume on mount / when the browser
  comes back online") is omitted: it targets
  `ChatClient.prototype.maybeAutoResume`, an API absent from the pinned (and
  latest published) `@tanstack/ai-client@0.21.0` and never invoked by
  `useChat`. It is untestable in this binding until that dependency ships the
  method.

## Verification

The port runs TanStack AI's React adapter tests against Octane across all
eleven hooks, with no skipped, todo, or expected-failure cases (except the
untestable auto-resume case above). A differential test compiles a shared
chat fixture for Octane and React and compares streamed output after each
step; output is byte-equal against real `@tanstack/ai-react@0.17.0`. An SSR
fixture and the upstream compile-time type tests are also included.

Current scope and verification status are tracked in the generated
[bindings status table](../../docs/bindings-status.md), sourced from this
package's [`status.json`](./status.json).

## License

MIT — contains source derived from
[TanStack AI](https://github.com/TanStack/ai) (MIT), adapted for Octane.
