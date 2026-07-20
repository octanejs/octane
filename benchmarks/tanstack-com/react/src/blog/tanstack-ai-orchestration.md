---
title: 'Introducing Experimental Workflows and Orchestrators in TanStack AI'
published: 2026-05-28
excerpt: 'Try the experimental TanStack AI orchestration PR build: generator-based workflows, typed agent calls, approvals, SSE streaming, AG-UI events, and React hooks.'
library: ai
authors:
  - Alem Tuzlak
---

![TanStack AI workflows and orchestrators](/blog-assets/tanstack-ai-orchestration/header.png)

Most AI apps start with one `chat()` call.

But as soon as you need something more complex, this all breaks apart. You either fall back to using sub-agents as tools, or you have to write your own glue and abstractions on top to make a semi-decent workflow or orchestration mechanism to power your app. This just detracts from your time to work on the features you really care about.

The model needs to draft, critique, revise, ask for approval, call another model, update state, and show the user what is happening while the run is still in progress. At that point, a one-shot chat endpoint turns into a hand-rolled workflow engine made of fetch calls, temporary state, custom SSE events, and a lot of code nobody wanted to own.

Today, TanStack introduces an experimental answer: **TanStack AI Workflows & Orchestrators**.

Before we go further, a fair warning!

This is not merged to `main`. It is not shipped, stable, or available in normal npm versions. It is a PR build you can try today through `pkg.pr.new` while the API is still being shaped. The goal is to get it in front of real use cases, demos, and feedback before we commit to the public API shape.

This is where you come in. We need your help. We need people to test out our workflows and our orchestration mechanisms, give us their thoughts and opinions, and help us shape the final APIs.

- PR: [TanStack/ai#542](https://github.com/TanStack/ai/pull/542)
- PR build packages: [pkg.pr.new comment](https://github.com/TanStack/ai/pull/542#issuecomment-4416347869)
- Package: `@tanstack/ai-orchestration`

The goal is simple: compose multiple typed LLM and agent steps as normal TypeScript async generators, stream each step to the UI, pause for human approval, and resume through the same SSE flow.

## Define your agents

Agents are typed wrappers around a `chat()` call or any async function. `defineAgent` gives each step an input schema, output schema, and implementation.

```typescript
import { chat } from '@tanstack/ai'
import { defineAgent } from '@tanstack/ai-orchestration'
import { openaiText } from '@tanstack/ai-openai'
import { z } from 'zod'

export const ArticleSchema = z.object({
  title: z.string(),
  body: z.string(),
})

export const writer = defineAgent({
  name: 'writer',
  input: z.object({
    topic: z.string(),
  }),
  output: ArticleSchema,
  run: ({ input }) =>
    chat({
      adapter: openaiText('gpt-4o'),
      outputSchema: ArticleSchema,
      stream: true,
      systemPrompts: [
        'Write a concise developer article with a clear title and practical body.',
      ],
      messages: [{ role: 'user', content: input.topic }],
    }),
})

export const EditorReviewSchema = z.object({
  approved: z.boolean(),
  article: ArticleSchema,
  notes: z.string(),
})

export const editor = defineAgent({
  name: 'editor',
  input: z.object({
    article: ArticleSchema,
    feedback: z.string().optional(),
  }),
  output: EditorReviewSchema,
  run: ({ input }) =>
    chat({
      adapter: openaiText('gpt-4o'),
      outputSchema: EditorReviewSchema,
      stream: true,
      systemPrompts: [
        'Edit the article for accuracy, clarity, and practical developer tone. Apply any optional reviewer feedback.',
      ],
      messages: [{ role: 'user', content: JSON.stringify(input) }],
    }),
})
```

`defineAgent` wraps either a `chat()` call or a normal async function with input and output schemas. The workflow runtime uses those schemas to validate what enters and leaves the step, and TypeScript uses them to infer the callable shape inside a workflow. From the workflow's perspective, `writer` and `editor` are normal typed async steps.

## Define a workflow

Once agents exist, `defineWorkflow` composes them with `yield*` inside an `async function*`.

```typescript
import {
  approve,
  defineWorkflow,
  fail,
  succeed,
} from '@tanstack/ai-orchestration'
import { z } from 'zod'
import { ArticleSchema, editor, writer } from './agents'

export const ArticleInputSchema = z.object({
  topic: z.string(),
})

export const ArticleWorkflowOutputSchema = z.discriminatedUnion('ok', [
  z.object({
    ok: z.literal(true),
    article: ArticleSchema,
  }),
  z.object({
    ok: z.literal(false),
    reason: z.string(),
  }),
])

export const articleWorkflow = defineWorkflow({
  name: 'article-workflow',
  input: ArticleInputSchema,
  output: ArticleWorkflowOutputSchema,
  agents: {
    writer,
    editor,
  },
  run: async function* ({ input, agents }) {
    const draft = yield* agents.writer({ topic: input.topic })
    const edited = yield* agents.editor({ article: draft })

    if (!edited.approved) {
      return fail(edited.notes)
    }

    const decision = yield* approve({
      title: `Publish "${edited.article.title}"?`,
      description: edited.notes,
    })

    if (!decision.approved) {
      return fail(decision.feedback ?? 'Publication declined')
    }

    return succeed({ article: edited.article })
  },
})
```

The interesting part is the lack of framework ceremony. TypeScript knows the input expected by `agents.writer`, and it knows the shape returned after the `yield*`.

Each `yield* agents.someAgent(...)` becomes a typed step. The runtime can emit lifecycle events around it, stream text while it runs, validate the result, snapshot state, and resume the generator with the typed output.

The workflow body is just TypeScript. Use `if`, `for`, `while`, `try`, `await`, helper functions, and whatever domain code you already have. The orchestration runtime only cares about the things you `yield*`.

Why async generator workflows? There are a lot of ways to model agent workflows. You can build a graph DSL. You can define nodes in JSON. You can describe a DAG and ask the runtime to interpret it. The reason we went with generator workflows is that whenever you yield the agent's step, it's streamed straight down to the client. The user sees everything in real time — tool calls, reasoning, whatever happens along the way — and by the end you just get the final output back.

## Expose it over SSE

Workflows run on the server. The browser consumes an event stream.

The PR adds `parseWorkflowRequest`, `runWorkflow`, and `inMemoryRunStore` from `@tanstack/ai-orchestration`. You can pipe the returned stream through the existing `toServerSentEventsResponse` helper from `@tanstack/ai`.

```typescript
import { toServerSentEventsResponse } from '@tanstack/ai'
import {
  inMemoryRunStore,
  parseWorkflowRequest,
  runWorkflow,
} from '@tanstack/ai-orchestration'
import { articleWorkflow } from './article-workflow'

const runStore = inMemoryRunStore({ ttl: 60 * 60 * 1000 })

export async function POST(request: Request) {
  const params = await parseWorkflowRequest(request)
  const stream = runWorkflow({
    workflow: articleWorkflow,
    runStore,
    ...params,
  })

  return toServerSentEventsResponse(stream)
}
```

`runWorkflow` emits AG-UI-style lifecycle events for the run. That includes run and step events, state snapshots, JSON Patch state deltas, output, and errors. The UI does not need to invent its own event protocol for "writer started", "editor streamed text", "approval requested", or "run finished".

The current built-in persistence is `inMemoryRunStore`. That is useful for local demos and single-process evaluation. Production durability is still future-facing and experimental run-store-interface territory, especially for long pauses, deploys, restarts, and multi-node environments. But the API is there to implement your own durable run store and swap it in when you're ready.

## Run it without a UI

A UI is optional. The SSE endpoint above exists so a browser can watch a run unfold, but the workflow itself is just a server-side async generator. If nothing is watching — a cron job, a queue worker, a batch script, or a plain JSON endpoint that only returns the final answer — you can run the workflow headless and never stream a single event to a client.

`runWorkflow` returns an async iterable, and iterating it is what drives the workflow forward. So for a headless run you drain the stream to completion, then read the final result back from the run store:

```typescript
import { inMemoryRunStore, runWorkflow } from '@tanstack/ai-orchestration'
import { articleWorkflow } from './article-workflow'

const runStore = inMemoryRunStore({ ttl: 60 * 60 * 1000 })

export async function generateArticle(topic: string) {
  const runId = crypto.randomUUID()

  const stream = runWorkflow({
    workflow: articleWorkflow,
    runStore,
    runId,
    input: { topic },
  })

  // No client is listening, so just drive the run to completion.
  for await (const _event of stream) {
    // Optionally log progress or persist events here.
  }

  const run = await runStore.getRunState(runId)

  if (run?.status === 'finished') {
    return run.output
  }

  throw new Error(run?.error?.message ?? `Workflow ended as "${run?.status}"`)
}
```

The same typed agents, schemas, state snapshots, and validation apply. You just skip `toServerSentEventsResponse`, the React hooks, and the browser entirely.

One caveat: a headless run has nobody to answer a `yield* approve(...)`. If the workflow hits an approval step, it pauses and `getRunState` reports `status: 'paused'` instead of `'finished'`. Server-only workflows shine when the pipeline runs end to end on its own. If you need a human in the loop, either resume the paused run programmatically with an `approval` result or keep a UI connected.

## Consume it from React

On the client, `WorkflowClient`, `useWorkflow`, and `useOrchestration` consume the streamed events and keep local run state updated.

```tsx
import { fetchWorkflowEvents, useWorkflow } from '@tanstack/ai-react'
import {
  ArticleInputSchema,
  ArticleWorkflowOutputSchema,
} from './article-workflow'

export function ArticleWorkflowDemo() {
  const workflow = useWorkflow({
    input: ArticleInputSchema,
    output: ArticleWorkflowOutputSchema,
    connection: fetchWorkflowEvents('/api/article-workflow'),
  })

  return (
    <section>
      <button
        type="button"
        disabled={workflow.status === 'running'}
        onClick={() =>
          workflow.start({
            topic: 'How typed agent workflows improve AI product UX',
          })
        }
      >
        Start workflow
      </button>

      {workflow.steps.map((step) => (
        <div key={step.stepId}>
          <strong>{step.stepName}</strong>
          <span>{step.status}</span>
        </div>
      ))}

      {workflow.currentText ? <pre>{workflow.currentText}</pre> : null}

      {workflow.pendingApproval ? (
        <div>
          <h2>{workflow.pendingApproval.title}</h2>
          <p>{workflow.pendingApproval.description}</p>
          <button type="button" onClick={() => workflow.approve(true)}>
            Approve
          </button>
          <button
            type="button"
            onClick={() => workflow.approve(false, 'Tighten the conclusion.')}
          >
            Request changes
          </button>
        </div>
      ) : null}

      {workflow.output?.ok ? (
        <article>
          <h1>{workflow.output.article.title}</h1>
          <p>{workflow.output.article.body}</p>
        </article>
      ) : null}

      {workflow.output && !workflow.output.ok ? (
        <p>{workflow.output.reason}</p>
      ) : null}
    </section>
  )
}
```

There is also `useOrchestration` for the same runtime with orchestration vocabulary. If your mental model is "run a workflow", use `useWorkflow`. If your mental model is "let a router pick the next agent", use `useOrchestration`.

```tsx
import { fetchWorkflowEvents, useOrchestration } from '@tanstack/ai-react'

export function ArticleOrchestrationDemo() {
  const orchestration = useOrchestration({
    input: ArticleInputSchema,
    output: ArticleWorkflowOutputSchema,
    connection: fetchWorkflowEvents('/api/article-orchestrator'),
  })

  return (
    <button
      type="button"
      disabled={orchestration.status === 'running'}
      onClick={() =>
        orchestration.start({
          topic: 'How typed orchestration improves AI product UX',
        })
      }
    >
      Start orchestration
    </button>
  )
}
```

## Human approval is part of the stream

Human-in-the-loop control is not a side channel in this PR.

When workflow code calls `yield* approve(...)`, the runtime emits an `approval-requested` event, persists the paused run in the run store, and closes the SSE response. The HTTP request is done. The server does not keep a socket open while a user thinks, checks a diff, or gets approval from someone else.

When the client calls `approve()`, it POSTs back to the same endpoint with the run id and approval result. `runWorkflow` resumes the generator and the next SSE response continues from the paused point.

That means approvals, revisions, and denial feedback can be modeled in the workflow itself:

```typescript
const decision =
  yield *
  approve({
    title: 'Publish article?',
    description: edited.notes,
  })

if (!decision.approved) {
  const revised =
    yield *
    agents.editor({
      article: edited.article,
      feedback: decision.feedback ?? 'Revise before publishing.',
    })

  return succeed({ article: revised.article })
}
```

The same event stream also carries state snapshots and JSON Patch deltas, so a UI can show a live state inspector, a timeline, or a draft preview without waiting for the final result.

## Workflows vs orchestrators

Use a workflow when you know the pipeline.

Writer, then editor, then approval is a workflow. Extract topics, draft outline, expand sections is a workflow. Run static checks, ask for approval, deploy to staging, ask again, deploy to production is a workflow.

Use an orchestrator when the next step should be selected turn by turn.

`defineOrchestrator` is a thin wrapper over workflows, so the workflow behavior already described applies the same way to orchestrators. It uses the same runtime pieces: typed agents, streaming steps, state snapshots, approvals, SSE transport, and React hooks.

The body is a router. The router looks at input, mutable state, and the previous result, then returns the next agent to run. When the router is done, it returns the final output.

```typescript
import {
  defineOrchestrator,
  defineRouter,
  succeed,
} from '@tanstack/ai-orchestration'
import { z } from 'zod'
import { ArticleSchema, editor, writer } from './agents'
import {
  ArticleInputSchema,
  ArticleWorkflowOutputSchema,
} from './article-workflow'

const ArticleStateSchema = z.object({
  draft: ArticleSchema.optional(),
  approved: z.boolean().default(false),
})

const articleRouter = defineRouter(
  {
    name: 'article-router',
    state: ArticleStateSchema,
  },
  async function* ({ input, state }) {
    if (!state.draft) {
      return {
        agent: 'writer',
        input: {
          topic: input.topic,
        },
      }
    }

    if (!state.approved) {
      return {
        agent: 'editor',
        input: {
          article: state.draft,
        },
      }
    }

    return {
      done: true,
      output: succeed({
        article: state.draft,
      }),
    }
  },
)

export const articleOrchestrator = defineOrchestrator({
  name: 'article-orchestrator',
  input: ArticleInputSchema,
  output: ArticleWorkflowOutputSchema,
  agents: {
    writer,
    editor,
  },
  router: articleRouter,
})
```

Routers may also yield if their decision needs async work, but their return value is the important part: either the next `{ agent, input }` pair to run or `{ done, output }` when orchestration is complete.

That gives you the same behavior with a different control-flow style. A workflow puts the sequence directly in the generator body. An orchestrator puts the next-step decision in a router.

## Try it and send feedback

If you are building multi-step AI product flows, this is the moment to test the shape. This is a PR build meant for evaluation, demos, and feedback — the public API can still change before stabilization.

Install the PR packages directly from pkg.pr.new:

```bash
npm i https://pkg.pr.new/TanStack/ai/@tanstack/ai-orchestration@542
npm i https://pkg.pr.new/TanStack/ai/@tanstack/ai@542
npm i https://pkg.pr.new/TanStack/ai/@tanstack/ai-react@542
npm i https://pkg.pr.new/TanStack/ai/@tanstack/ai-client@542
npm i https://pkg.pr.new/TanStack/ai/@tanstack/ai-openai@542
```

Full documentation for this PR lives on the GitHub branch, not the released TanStack docs site:

- [Overview](https://github.com/TanStack/ai/blob/worktree-cryptic-singing-wadler/docs/orchestration/overview.md)
- [Workflows guide](https://github.com/TanStack/ai/blob/worktree-cryptic-singing-wadler/docs/orchestration/workflows.md)
- [Orchestrators](https://github.com/TanStack/ai/blob/worktree-cryptic-singing-wadler/docs/orchestration/orchestrators.md)
- [Approvals](https://github.com/TanStack/ai/blob/worktree-cryptic-singing-wadler/docs/orchestration/approvals.md)
- [Run persistence](https://github.com/TanStack/ai/blob/worktree-cryptic-singing-wadler/docs/orchestration/run-persistence.md)
- [API reference](https://github.com/TanStack/ai/blob/worktree-cryptic-singing-wadler/docs/api/ai-orchestration.md)

Then share demos, feedback, and rough edges on [PR 542](https://github.com/TanStack/ai/pull/542) before the API stabilizes.
