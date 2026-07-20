---
title: 'TanStack AI Beta: The Switzerland of AI Tooling Grows Up'
published: 2026-06-09
excerpt: Six months ago we shipped the alpha with a promise - a framework-agnostic, provider-agnostic AI toolkit with no lock-in, ever. Today TanStack AI hits Beta with every modality, a hardened protocol, middleware, orchestration, host-side MCP, and 265 E2E tests running across 10 providers on every PR.
library: ai
authors:
  - Tom Beckenham
---

![TanStack AI Beta](/blog-assets/tanstack-ai-beta/header.png)

**The TanStack team is thrilled to announce the Beta release of [TanStack AI](/ai), the framework-agnostic, provider-agnostic AI toolkit built for developers who want control over their stack.**

When we [shipped the alpha back in December](/blog/tanstack-ai-alpha-your-ai-your-way), we made a promise. No vendor lock-in. No platform to migrate to. No framework dictating how you build. Just honest open source tooling - the Switzerland of AI - that works with the stack you already have.

Six months and a long list of releases later, that promise still holds. But the toolkit behind it has grown up. What was a handful of adapters and an early protocol is now a complete, multi-modal, multi-framework AI platform.

This is the Beta.

## What "Beta" Means

The alpha was a bet on an architecture. We told you there would be bugs, rough edges, and APIs that might change, and there were. We prototyped through [an `ai()` function we had to kill](/blog/tanstack-ai-the-ai-function-postmortem), [re-architected the adapters](/blog/tanstack-ai-why-we-split-the-adapters), and [rebuilt the modality story twice](/blog/tanstack-ai-alpha-2) before we were happy.

Beta means the bet paid off. The core APIs are stable. The protocol is documented and versioned. The surface area is broad enough to build a real product on, and the testing infrastructure is strong enough that we trust it. We're no longer asking you to take a chance on a prototype. We're asking you to build with us.

## Every Modality, One API

The biggest change since alpha is breadth. TanStack AI is no longer a text-generation library with extras bolted on. Every major modality is a first-class, typed activity, and every provider ships small, capability-split adapters (`openaiText`, `geminiAudio`) instead of one monolith:

- **Text and [streaming structured data](/blog/streaming-structured-output)**: stream typed objects as they're generated, not just tokens, so your UI can render structured results progressively — and [keep them across turns](/blog/multi-turn-structured-output).
- **[Tool calls](/ai/docs/tools/tools)**: defined once, with isolated [server](/ai/docs/tools/server-tools) and [client](/ai/docs/tools/client-tools) implementations and type safety that holds across the whole app.
- **[Summarization](/ai/docs/reference/functions/summarize)** out of the box.
- **[Image generation](/ai/docs/media/image-generation)** across providers.
- **[Video generation](/ai/docs/media/video-generation)** through the same typed activity model: swap the provider, keep your code.
- **[Audio generation](/blog/tanstack-ai-audio-generation)**: music, sound effects, text-to-speech, and transcription via a streaming `generateAudio` activity, with fal and Gemini Lyria adapters.
- **[Realtime voice chat](/blog/tanstack-ai-realtime-voice-chat)**: real voice, real time, with OpenAI Realtime over WebRTC and ElevenLabs over WebSocket, all behind one provider-agnostic architecture.

Here's what that looks like in practice. A chat endpoint on the server:

```ts
import { chat, toServerSentEventsResponse } from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'

export async function POST(request: Request) {
  const { messages } = await request.json()

  const stream = chat({
    adapter: openaiText('gpt-5.2'),
    messages,
  })

  return toServerSentEventsResponse(stream)
}
```

And the client, in React:

```tsx
import { fetchServerSentEvents, useChat } from '@tanstack/ai-react'

function Chat() {
  const { messages, sendMessage, isLoading } = useChat({
    connection: fetchServerSentEvents('/api/chat'),
  })
  // render messages however you like
}
```

And `useChat` is just the start of the hook family. Every modality gets one — `useGeneration` for streaming structured output, `useGenerateImage`, `useGenerateAudio`, `useGenerateSpeech`, `useTranscription`, `useSummarize`, `useGenerateVideo`, and `useRealtimeChat` — all with the same shape, all wired into devtools out of the box.

Switching providers is the import and the adapter. Nothing else moves:

```diff
- import { openaiText } from '@tanstack/ai-openai'
+ import { anthropicText } from '@tanstack/ai-anthropic'

  const stream = chat({
-   adapter: openaiText('gpt-5.2'),
+   adapter: anthropicText('claude-opus-4-6'),
    messages,
  })
```

And every other modality follows the same shape — an adapter in, a typed result out:

```ts
import { generateAudio } from '@tanstack/ai'
import { geminiAudio } from '@tanstack/ai-gemini'

const result = await generateAudio({
  adapter: geminiAudio('lyria-3-pro-preview'),
  prompt: 'A cinematic orchestral piece with a rising string motif',
})
```

Switch the modality, switch the provider, and the shape of your code stays the same.

## Per-Model Type Safety That Actually Matters

Every provider has different options. Every model supports different modalities and different native tools. TanStack AI types `modelOptions` on a per-model basis, so your IDE knows exactly what each model can do.

That extends to provider tools: native capabilities like web search and code execution that some models support and others silently ignore. As of Beta, [those pairings are gated at the type level](/blog/type-safe-provider-tools-tanstack-ai). Wire an incompatible tool to a model and TypeScript tells you on the line where you pass it, instead of letting it fail quietly in production.

## Composing Real Systems

A toy chat endpoint is easy. A production one accretes logging, content guarding, caching, and tracing until it's an unmaintainable monster. Beta ships the pieces that keep that complexity in check:

- **[Middleware](/blog/tanstack-ai-middleware)**: hook into every stage of the `chat()` lifecycle to observe, transform, or short-circuit behavior — plus built-in middleware for tool-result caching, content redaction, and OpenTelemetry tracing.
- **[Lazy tool discovery](/blog/tanstack-ai-lazy-tool-discovery)**: stop spending tokens (and model accuracy) on tool definitions the model doesn't need yet.
- **[Code Mode](/blog/tanstack-ai-code-mode)**: let the LLM write and execute TypeScript in a secure sandbox, composing your tools with loops, conditionals, and `Promise.all` in a single shot instead of one round-trip per call.
- **[Host-side MCP](/blog/your-mcp-your-way)**: connect a single Model Context Protocol server or a whole pool, with managed or manual lifecycle and the type-safety level that fits your app, from zero-config discovery to fully generated end-to-end types.
- **[Experimental orchestration](/blog/tanstack-ai-orchestration)**: generator-based workflows, typed agent calls, human-in-the-loop approvals, SSE streaming, AG-UI events, and React hooks for building multi-step agentic systems.

## TypeScript First, On An Open Protocol

TanStack AI is TypeScript-first. The toolkit, the per-model type safety, and everything you've seen in this post is built for TypeScript end to end. But the thing that makes it all portable is the protocol: we've documented exactly how the server and client communicate, and in Beta it's stable. Speak it over any transport (HTTP, WebSockets, RPC) through a connection adapter, and our clients work with your backend.

**AG-UI is at its core.** The events flowing across that connection are AG-UI events, not a bespoke format with a compatibility shim on top. Because the standard is built in from the ground up, TanStack AI interoperates with the wider agent ecosystem out of the box: AG-UI-compliant agent frameworks like Microsoft Agent Framework, Agno, LangGraph, CrewAI, Mastra, Pydantic AI, and LlamaIndex can all sit behind a TanStack AI frontend. And because AG-UI is language-agnostic, that backend doesn't have to be TypeScript at all — point your client at an agent server written in Kotlin, Rust, .NET, Python, or anything else that speaks the protocol. It's the same no-lock-in principle, applied to the wire.

On the client side, vanilla JS, React, Solid, Vue, Svelte, and Preact are all ready.

## Debugging You Can Actually See

AI pipelines are notoriously opaque: a missing chunk here, a middleware that didn't fire there, a tool call with mystery arguments. TanStack AI ships two answers:

- **[Pluggable debug logging](/blog/debug-logging-for-tanstack-ai)**: flip one flag and the whole pipeline prints itself, with per-category toggles across every activity and adapter.
- **Isomorphic devtools**: a full panel, built on [TanStack Devtools](/devtools), that shows you what the LLM is doing on both sides of the connection.

![TanStack AI Devtools showing a live useChat hook: the conversation timeline, tool and token metrics, and the user view side by side](/blog-assets/tanstack-ai-beta/devtools.png)

Debug mode is one line:

```ts
const stream = chat({
  adapter: openaiText('gpt-5.2'),
  messages,
  debug: true, // or pick categories: { provider: true, middleware: true, tools: true }
})
```

Raw provider chunks, middleware hook inputs and outputs, tool execution, agent-loop iterations — each its own toggle, with a pluggable logger if `console` isn't where you want it to go.

## Tested Like We Mean It

Confidence at Beta isn't a vibe. It's 265 deterministic end-to-end tests running across 10 LLM providers on every pull request — up from 147 tests and 7 providers when we [wrote about how we test](/blog/how-we-test-tanstack-ai-across-7-providers). Provider behavior drifts, models get deprecated, and APIs change underneath you. Our test suite catches it before you do.

## Still Honest, Still Open Source

None of this changes the original deal. There's no service to buy. No platform to migrate to. No vendor lock-in waiting around the corner, and there never will be. TanStack AI is open source, built by the same small, volunteer teams that have shipped framework-agnostic developer tools for years.

And if you're weighing it against the Vercel AI SDK, we keep an honest, feature-by-feature [comparison in the docs](/ai/docs/comparison/vercel-ai-sdk) — including the places they're ahead.

We're still taking a lot on, and we still want your help. Build adapters. File the bug you just hit. Tell us what's missing. Beta is the most stable TanStack AI has ever been, but it's not the finish line. It's the version we're confident enough to ask you to build on.

So go build something. It starts with one install:

```bash
pnpm add @tanstack/ai @tanstack/ai-react @tanstack/ai-openai
```

And if OpenAI isn't your provider, that last package is the only thing you'd change — `ai-anthropic`, `ai-gemini`, `ai-groq`, `ai-ollama`, `ai-openrouter`, take your pick.

[Get started with TanStack AI](/ai), and tell us what you ship.
