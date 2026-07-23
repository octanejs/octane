---
name: build-octane-software
description: Build or materially change production-grade Octane applications, components, libraries, and framework integrations with explicit correctness, performance, validation, and review gates.
---

# Skill: Build production-grade Octane software

Use this before creating or materially changing an Octane application, component,
library binding, or framework integration. It is the quality baseline for work
performed with Octane's MCP tools; task-specific skills add syntax and migration
details but do not replace these gates.

## Start with the contract

1. State the user-visible behavior, inputs, failure states, accessibility needs,
   and server/hydration expectations before choosing components or hooks.
2. Inspect the current project conventions, package versions, compiler/Vite
   configuration, existing tests, and official `@octanejs/*` bindings. Do not
   invent an API that current sources do not expose.
3. Identify the important user journey and its likely performance budget: initial
   JavaScript, render/hydration work, interaction latency, network/data work, and
   memory lifetime.

## Design for Octane's performance model

- Keep stable work outside reactive updates. Avoid state that can be derived,
  effects that only mirror state, and subscriptions broader than the component
  needs.
- Use keyed `@for` blocks for dynamic collections with stable domain keys. Keep
  item components focused so an item update does not rebuild unrelated work.
- Prefer the platform and Octane's compiled directives over runtime abstraction
  layers. Do not import React runtime packages or ship React-created JSX trees.
- Keep expensive parsing, sorting, formatting, and object construction off common
  render paths; memoize only when the avoided work and invalidation rules justify
  the retained state.
- Use native event semantics. `onInput` is the per-edit event for text controls;
  do not add synthetic `onChange` compatibility or event wrapper allocation.
- For SSR, avoid client/server data divergence and duplicate fetches. Exercise
  hydration with production-compiled output and preserve abort/error behavior.
- Treat bundle size and dependency cost as performance. Check for an official
  binding before adding a compatibility layer or a second framework runtime.

## Validate behavior and performance

- Test realistic public behavior: rendered output, native events, focus,
  accessibility state, errors, loading, cleanup, and hydration when used.
- Include empty, loading, error, repeated-interaction, and large-data cases that
  can expose stale state, duplicate work, or unbounded retention.
- Use a production build for final validation. Measure the important user journey
  before and after performance-sensitive changes under comparable conditions.
- Do not claim that code is faster because it is shorter, uses memoization, or
  causes fewer apparent renders. Report measured results and the command or
  procedure that produced them; call inconclusive measurements inconclusive.

## Adversarial self-review

Before handoff, reread the complete diff and try to reject it:

1. Can a simpler design preserve the contract with less state, indirection, or
   retained data?
2. What happens for empty, large, rapid, nested, failing, aborted, and unmounted
   cases?
3. Are effects cleaned up, async results made stale safely, and subscriptions
   scoped to their consumers?
4. Does the same code work in development, production, SSR, and hydration modes
   that the project supports?
5. Did an optimization move work to startup, the server, garbage collection, or
   another component rather than remove it?
6. Are accessibility, security, diagnostics, and maintainability at least as
   strong as before?

Fix findings, rerun the relevant checks, and review the final diff again. Report
validation, measured performance evidence, improvements made during self-review,
and any residual risk. Never hide an unverified path behind “all tests pass.”
