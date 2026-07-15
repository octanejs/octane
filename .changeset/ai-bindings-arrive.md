---
'@octanejs/tanstack-ai': patch
---

Add the Octane binding for TanStack AI (`@tanstack/ai-react` 0.16.4), porting the
hook surface — `useChat`, `useRealtimeChat`, `useGeneration`, the media generation
hooks, `useTranscription`, `useSummarize`, `useAudioRecorder`, and
`useMcpAppBridge` — while reusing `@tanstack/ai` and `@tanstack/ai-client`
unchanged. Includes ported behavioral tests, differential React parity coverage,
SSR support, and type tests. The `./mcp-apps` `MCPAppResource` component is not
ported (it renders the React-only `@mcp-ui/client` `AppRenderer`); the
framework-agnostic `useMcpAppBridge` hook is available on the main entry.
