# Lean runtime: mechanisms worth testing

Research note, 2026-09-16. This is a design hypothesis, not an implementation or measured performance result. It follows the accounting distinction in [async-signals-performance.md](./async-signals-performance.md): deleting work, deferring its delivery, and making an interaction faster are different outcomes. The objective is a substantially simpler implementation, not fitting an arbitrary additional-byte allowance.

The non-negotiable scenario remains: seeded SSR signals; synchronous early input without the full renderer; streamed text, keyed lists and rich components; a placeholder becoming an interactive map while its items continue arriving; independently updating conversation titles; and SPA navigation away/back without stale streams replacing current client state. Compiler optimizations must preserve those capabilities, not replace them with application controllers.

## 1. Compile the update, not a description of the update

Primary evidence: Solid's DOM Expressions compiler emits DOM references, targeted reactive functions and selected helper imports from JSX. Solid describes fine-grained updates at the changed attribute rather than component re-execution. Svelte's runes are compiler-recognized syntax with placement restrictions, not arbitrary runtime functions. These demonstrate moving semantic decisions to compilation, not eliminating all runtime tracking. [DOM Expressions compiler example](https://github.com/ryansolid/dom-expressions/tree/main/packages/babel-plugin-jsx-dom-expressions#example), [Solid reactivity](https://docs.solidjs.com/advanced-concepts/fine-grained-reactivity), [Svelte runes](https://svelte.dev/docs/svelte/what-are-runes).

Octane hypothesis: keep the binding-program representation as compiler IR, but lower proven programs into ordinary JavaScript that directly claims nodes, subscribes, updates and disposes through narrow shared primitives. Generate concrete class/style/text/control operations rather than shipping their operation tags, generic projection arrays and interpreter switches. Emit a keyed-region helper only for actual keyed regions; compile child and slot calls as calls with explicit lifetime ownership. Share the generated update implementation between SSR adoption and client construction wherever their semantics coincide.

Deletion test: for the migrated fixture, the emitted closure must lose the relevant generic program interpreter and descriptor traversal, not merely move them to a later chunk. Removing the old implementation must not break that fixture's mount, adoption or updates. Current candidate locations are [program planning](../packages/octane/src/compiler/dom-binding-program.js) and [program execution](../packages/octane/src/dom-binding-program.ts).

Tradeoff: generated code and closures can outweigh a compact shared interpreter, especially with repeated components. Share immutable code, not instance state. Retain canonical coercion, focus/selection, disposal and atomic publication primitives; direct mutation must not bypass them. Unknown spreads or escaped callables need a documented existing fallback, not a newly invented restriction. Start with one complete component, including branches and imported children, rather than a leaf-only replacement API.

Falsify with a repeated-component size crossover, inactive-to-active branches, changing caller slots, focused keyed reorders, reentrant cleanup and invalidation during preparation. Reject if combined generated code plus helpers grows, or if updates lose current publication guarantees.

## 2. Erase server-only work using state reachability

Primary evidence: Marko 6 describes analyzing a state tree rather than treating whole components as the unit of browser code. Its targeted compilation emits server HTML separately from client update functions; static content outside changing state does not require client construction code. Marko also supports streamed HTML, including out-of-order fragments requiring client placement. These mechanisms can coexist; streaming is not itself evidence that every component must ship a general renderer. [Fine-grained bundling](https://markojs.com/docs/explanation/fine-grained-bundling), [targeted compilation](https://markojs.com/docs/explanation/targeted-compilation), [HTML streaming](https://markojs.com/docs/explanation/streaming).

Octane hypothesis: determine which values and DOM ranges can change in each authored program, including future streamed and SPA states. Erase server-only expression evaluation, unreachable construction templates and duplicate early/normal presentation functions. Component extraction should not multiply equivalent emitted work. Preserve creation code for nodes that can appear later: initial absence is not proof of permanent absence.

Deletion test: split and unsplit versions of the same view should retain approximately the same behavior code; adding SSR-only narrative content should not proportionally increase client JavaScript. Measure HTML markers and seeded data too. Loading an unchanged renderer later is deferral, not deletion.

Tradeoff: cross-module reachability needs stable contracts for imported components and slots. Dynamic code may resist proof. Separate compilation must preserve semantic evaluation order, getters, StyleX folding and ownership identity. A full Marko-like state-tree rewrite is not the first step; eliminating duplicate compiler output for one closed program is incremental.

Falsify with a stream that appends lists, upgrades the map placeholder and adds items after upgrade, then navigates away/back while old responses complete. Missing future construction or lost ownership disproves the optimization, even if the initial shell looks correct.

## 3. Keep one reactive substrate; serialize data, not an application heap

Primary evidence: Alien Signals exposes `createReactiveSystem` with host-provided update/notification/unwatched behavior and linked dependency traversal. It separates the propagation algorithm from the surface API. Octane already uses this substrate in [signals/graph.ts](../packages/octane/src/signals/graph.ts); replacing the library is not a demonstrated answer to surrounding framework cost. [Alien Signals surface integration](https://github.com/stackblitz/alien-signals#creating-your-own-surface-api), [algorithm source](https://github.com/stackblitz/alien-signals/blob/master/src/system.ts).

Octane hypothesis: maintain one canonical cell identity and dependency graph across early bindings, stream updates and later renderer consumers. Audit extra mirrored state, observer wrappers and transfer records by invariant: delete a representation only when the canonical cell plus its actual lifetime owner can enforce the same rule. Async producers, stream epochs and transition attempts remain real responsibilities, but they should not require a second general component/tree model. Merely placing those responsibilities in another module is not a total-byte reduction.

Qwik provides a useful counterexample to an apparently free solution. It avoids replay by serializing listener locations, component relationships and subscriptions. QRLs additionally encode captured-reference indices. That is a deliberate metadata and serialization protocol, not zero machinery. Adopting it wholesale would introduce a new closure/heap contract. [Resumability](https://qwik.dev/docs/concepts/resumable/), [QRL encoding](https://qwik.dev/docs/advanced/qrl/).

Keep Octane's synchronous early input path. Qwik explicitly documents limitations of delayed handlers for `preventDefault`, propagation and `currentTarget`, and requires a synchronous alternative for some events. Lazy-loading the first input handler is therefore not an equivalent optimization. [Qwik event semantics](https://qwik.dev/docs/core/events/#asynchronous-events).

Tradeoff: request isolation, dirty input precedence, SPA retention, abort and transition publication cannot be removed merely because a scalar graph is small. Distinguish absent capability overhead from necessary lifecycle state. Unknown serialized closures should not become the default escape hatch.

Falsify with typing before draft restoration, SSR seeding followed by stream updates and renderer takeover, repeated navigation and disposal, plus the held-transition case where canonical state and public notifications remain old until accepted DOM commits. Count subscriptions, producer starts/aborts and retained owners, not just rendered output.

## First experiment and decision rule

Use one existing rich renderer-free fixture to compare current interpretation with direct compiler lowering; preserve its source, capabilities and dependencies. This tests the most direct deletion opportunity before adding resumability or transaction abstractions. Report early input closure, first structural update, later renderer closure and their deduplicated union, together with HTML/data bytes, request count, parse/evaluation work, allocation and SSR throughput. Include an ordinary renderer control and the complete streaming/SPA behavior above. No vendor benchmark in these sources establishes an Octane saving.

Only expand after identifying exactly which old runtime and generated representation disappear. If both systems remain necessary for the migrated use case, the experiment has added another implementation rather than simplified the architecture.
