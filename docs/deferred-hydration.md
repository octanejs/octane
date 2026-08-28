# Deferred hydration

> [!NOTE]
> Deferred hydration is experimental. Its API and compiler protocol may change
> while Octane is in alpha.

`<Hydrate>` keeps useful server-rendered HTML visible while delaying the work
that makes a subtree interactive. It is intended for initial-page content that
can be read, styled, and indexed immediately but does not need to run component
code or attach events immediately.

```tsrx
import { Hydrate } from 'octane';
import { visible } from 'octane/hydration';

export function ProductPage() @{
	<main>
		<ProductHero />
		<Hydrate when={visible({ rootMargin: '400px' })}>
			<Reviews />
		</Hydrate>
	</main>
}
```

The server still renders `Reviews`. During initial hydration, Octane adopts the
boundary's persistent `<div>` but leaves the existing child DOM dormant. When
the boundary becomes visible, Octane loads its generated child chunk, hydrates
the preserved DOM in place, and then enables refs, effects, and events.

Deferred hydration applies only when matching server HTML exists in the initial
document. A boundary first mounted after the app is running renders normally on
the client.

## The three decisions

Every boundary makes three performance decisions:

| Prop | Default | Controls |
| --- | --- | --- |
| `when` | required | When preserved server HTML becomes interactive. |
| `split` | `true` | Whether the compiler moves the children into a generated JavaScript chunk. |
| `prefetch` | none | Whether code or other resources begin loading before `when` resolves. |

The complete component surface is:

| Prop | Type | Description |
| --- | --- | --- |
| `when` | `HydrationStrategy \| (() => HydrationStrategy)` | Required hydration trigger. The function form runs only on the client and must return synchronously. |
| `split` | `boolean` | Compiler-split the direct children into a deferred chunk. Defaults to `true`. |
| `prefetch` | `HydrationPrefetchStrategy \| HydrationPrefetchFunction` | Start loading the split chunk or run custom preparation before hydration. |
| `fallback` | renderable | Client-only loading UI for a later client mount or suspension. |
| `onHydrated` | `() => void` | Called once after the child successfully commits on the client. |
| `children` | renderable | The subtree rendered on the server and deferred on the client. |

`HydrateOptions` is exported from `octane/hydration` for reusable option objects:

```tsrx
import { Hydrate } from 'octane';
import { interaction, type HydrateOptions } from 'octane/hydration';

const deferredEditor = {
	when: interaction({ events: ['focusin', 'click'] }),
	split: true,
} satisfies HydrateOptions;

<Hydrate {...deferredEditor}>
	<RecommendationEditor />
</Hydrate>
```

### `when`

Import strategies from `octane/hydration`:

```tsrx
import { Hydrate } from 'octane';
import { interaction, visible } from 'octane/hydration';

export function Recommendations() @{
	<Hydrate when={visible()}>
		<RecommendationList />
	</Hydrate>

	<Hydrate when={interaction({ events: ['focusin', 'click'] })}>
		<RecommendationEditor />
	</Hydrate>
}
```

A function form can make the decision from browser-only information. Octane
does not evaluate this function on the server, and it must return a strategy
synchronously on the client.

```tsrx
<Hydrate
	when={() =>
		window.matchMedia('(pointer: coarse)').matches
			? interaction({ events: 'click' })
			: visible()
	}
>
	<Recommendations />
</Hydrate>
```

Available strategies:

| Strategy | Behavior |
| --- | --- |
| `load()` | Hydrates with the initial app hydration. |
| `idle({ timeout? })` | Uses `requestIdleCallback`, with a 2,000 ms default timeout fallback. |
| `visible({ rootMargin?, threshold? })` | Uses `IntersectionObserver`; the default margin is `600px`. |
| `media(query)` | Hydrates when the media query matches. |
| `interaction({ events? })` | Hydrates on interaction intent and replays the triggering event. |
| `condition(booleanOrGetter)` | Hydrates once the condition is truthy. |
| `never()` | Keeps initial server HTML permanently static. |

`interaction()` listens for `pointerenter`, `focusin`, `pointerdown`,
`touchstart`, `touchend`, `beforeinput`, `input`, `compositionstart`,
`compositionupdate`, `compositionend`, and `click` by default. Supported custom
events also include `auxclick`, `contextmenu`, `dblclick`, `keydown`, `keyup`,
`mousedown`, `mouseenter`, `mouseover`, `mouseup`, `pointerover`, and
`pointerup`.

#### Capture interactions before `hydrateRoot()`

An immediate `hydrateRoot()` call needs no extra setup: mounting the first
`Hydrate` boundary installs interaction capture as a synchronous fallback. If
your client entry awaits route discovery, data, or dynamic imports before it
calls `hydrateRoot()`, install the lightweight capture queue before that work so
an interaction during the gap can be replayed:

```ts
import { hydrateRoot } from 'octane';
import { initializeHydrationEventCapture } from 'octane/hydration';

initializeHydrationEventCapture();

await prepareClient();
hydrateRoot(document.getElementById('app')!, App);
```

Calling `initializeHydrationEventCapture()` more than once is safe; Octane
installs the listeners only once per document.

Hydration is one-way: after `condition()` becomes true and the boundary
hydrates, making it false again does not return the subtree to a dormant state.

### `split`

Splitting is enabled by default:

```tsrx
<Hydrate when={visible()}>
	<HeavyReviewsWidget />
</Hydrate>
```

This defers both component execution and the child JavaScript. Set the literal
`split={false}` when the code is already required elsewhere or when a separate
chunk would not be worthwhile:

```tsrx
<Hydrate when={idle()} split={false}>
	<SmallBadge />
</Hydrate>
```

The compiler recognizes `Hydrate` imported from `octane`, including an import
alias. Split children must be authored directly inside the boundary. Extraction
rejects function-as-children, hook calls directly inside the extracted JSX,
scoped `<style>` elements (their rules belong to the owning component's single
style scope), and `this` or `super` captures; move that work into a child
component or opt out with `split={false}`. Ordinary lexical values can be
captured by the generated child component.

Generated Hydrate chunks are not eagerly module-preloaded. Lazy-module discovery
for independently suspended siblings never enters a dormant Hydrate boundary,
so its child code remains deferred until activation or an explicit prefetch
strategy. The Vite and Rsbuild app integrations still link CSS reachable from a
route's deferred chunks, including its layout and configured root fallbacks,
because that route's server HTML needs its styling before the child JavaScript
loads. This eager CSS collection follows the composed route's asset graphs; it
does not turn deferred JavaScript into an eager dependency.

### `prefetch`

A strategy-form prefetch loads the generated child chunk early without making
the boundary interactive. It accepts `load()`, `idle()`, `visible()`, `media()`,
or `interaction()`; `condition()`, `never()`, and function-form strategies are
activation-only.

```tsrx
import { idle, interaction } from 'octane/hydration';

<Hydrate when={interaction()} prefetch={idle()}>
	<ProductRecommendations />
</Hydrate>
```

Strategy prefetching requires splitting, so TypeScript rejects it with
`split={false}`. A procedural prefetch can also prepare data and works with
either split mode:

```tsrx
<Hydrate
	when={visible()}
	prefetch={async ({ preload, signal }) => {
		await preload();
		await warmReviews({ signal });
	}}
>
	<Reviews />
</Hydrate>
```

The procedural context contains:

- `preload()`, which loads the generated child chunk or resolves immediately
  with `split={false}`;
- `waitFor(strategy)`, which accepts the same five prefetch strategies and
  resolves with `'prefetch'`, `'hydrate'`, or `'abort'`;
- `signal`, an `AbortSignal` for cancelable work; and
- `element`, the persistent boundary `<div>`.

An awaited procedural-prefetch promise blocks hydration if `when` resolves
first. Fire-and-forget work does not.

## Fallbacks and completion

`fallback` is client-only loading UI for a boundary that first mounts after the
app is running and then suspends on its child chunk or child data. It does not
replace initial server HTML while a boundary waits for its strategy or while
that initial boundary first suspends during activation.

```tsrx
<Hydrate when={visible()} fallback={<ReviewsSkeleton />}>
	<Reviews />
</Hydrate>
```

To keep client-only fallback code out of SSR, the compiler removes a direct
`fallback` attribute, an inline object-spread fallback, and a statically
resolvable single-use `const` spread from the server output. Shared or dynamic
spread objects are left intact because rewriting them could change observable
JavaScript behavior; keep their fallback values safe to evaluate on the server.

`onHydrated` runs once after the child successfully commits on the client,
whether the boundary adopts preserved server DOM or mounts client-only.

The exact direct-import form `<Hydrate split={false} when={never()}>` is a
server-only static range. The compiler removes its descendants from the client
render and prunes private module-scope declarations and imports reachable
exclusively from that range. SSR emits the children without a host wrapper, and
hydration reserves their ID positions without evaluating or reconciling them. A
client-only mount has no server range to preserve, so this exact form renders no
children. The tag must have exactly those two attributes; additional attributes,
spreads, indirect `Hydrate`/`never` values, and every other strategy retain the
ordinary runtime boundary semantics. Shared, exported, and coupled declarations
remain in the client module so the optimization cannot change unrelated module
behavior.

When a descendant module is reachable only through a pruned static declaration
chain, it is absent from the client manifest; a CSS file imported only by that
module is absent too. Import ordinary stylesheets from an eager route/layout
module. Scoped `<style>` remains safe: the client compiler retains a directly
authored style long enough to preserve the surrounding component's scope hash,
while SSR collects styles owned by removed descendant components and emits them
with the rendered static content.

For streamed static content, a synchronous unhandled server error still reaches
the nearest authored server catch (or the stream's fatal path). If a pending
fallback has already flushed, a later rejection or abort terminalizes that
server-owned range and retains the fallback; it cannot request client recovery
because its client graph does not exist.

## Behavior-only roots and external ownership

A permanently static boundary intentionally never installs its descendant
component handlers: its client component graph does not exist. When another
system owns that markup, attach independent behavior through `octane/behavior`
instead of hydrating or rendering the externally managed range:

```ts
import { attachBehaviorRoot } from 'octane/behavior';
import { articleStream } from './article-stream.js';

const lifetime = new AbortController();
const root = attachBehaviorRoot(document.querySelector('#app')!, {
	signal: lifetime.signal,
});
const streamOwner = Symbol('article stream');

root.registerExternalRange(document.querySelector('#article')!, {
	owner: streamOwner,
	ready: articleStream.allReady,
});

let activateAnnotation: (event: Event, element: Element) => void;
let observeAnnotation: (element: Element, signal: AbortSignal) => () => void;

root.registerBehavior({
	id: 'article-annotations',
	owner: streamOwner,
	target: '[data-annotation]',
	events: ['click'],
	ready: import('./annotations.js').then((module) => {
		activateAnnotation = module.activateAnnotation;
		observeAnnotation = module.observeAnnotation;
	}),
	adopt(element, { signal }) {
		return observeAnnotation(element, signal);
	},
	handleEvent(event, element) {
		activateAnnotation(event, element);
	},
});

await root.ready;

// Aborts pending work, disconnects observers/listeners, and runs every
// adoption cleanup exactly once. Existing DOM is preserved by default.
root.dispose();
```

`attachBehaviorRoot` neither renders nor hydrates its container. Existing DOM,
attributes, and externally streamed updates retain their identity; a single
root-scoped observer discovers later matching elements and releases behavior
when elements leave the container. Importing the focused `octane/behavior`
entry does not load the component runtime, compiler, or server renderer. The
same API and public types are also exported by `octane`.

Each external range belongs to its declared `owner`. Strictly nested ranges are
allowed, and the closest registered range determines ownership for behaviors
with an `owner` constraint. Registering the same element for another owner
throws unless `{ replace: true }` explicitly hands the range to its new owner;
handoff aborts the displaced range and invalidates stale asynchronous work.
An already-canceled replacement never evicts a healthy existing owner.
Ranges must belong to the root's document and container. Their optional `ready`
promise delays adoption without preventing the external owner from updating
markup. Individual ranges and behavior registrations expose their cancellation
signal, readiness, and an idempotent `dispose()` method.

Named behaviors may list already registered `dependencies` and incompatible
`conflicts`. Registration fails for unknown dependencies, duplicate IDs, or an
active conflict. Adoption waits for dependencies, the entry's optional `ready`
promise, and its closest external range. Root readiness reflects the active
registrations and ranges at the instant `root.ready` is read.

Delegated `events` begin listening immediately. If an interaction arrives
before its target is adopted, `handleEvent` later receives the exact original
same-document `Event`, including its genuine `isTrusted` value. Octane does not
redispatch the event, synthesize trust, repeat native link or form activation,
or restore transient user activation that expired during asynchronous loading.
Code requiring transient activation must run synchronously while the original
event is being dispatched.

Root identity is scoped to its document and container. A second root for the
same live container requires `{ replace: true }`, which disposes the old root
without removing markup; creating a root for a replacement document never adopts
listeners or ranges from its predecessor. Disposing an independently owned
nested root immediately restores eligible behavior belonging to its surviving
ancestor root. Pass `{ preserveDOM: false }` to `root.dispose()` only when the
root should explicitly clear its container.

## Correctness and nesting

Deferred hydration is a performance hint. An update outside a dormant boundary
may open it early when Octane must reconcile the child to avoid stale server
HTML. `never()` is the exception: its initial server subtree remains static.

Treat `when` as boundary configuration rather than a strategy state machine. If
the intended meaning of a boundary changes, give `Hydrate` a new `key` to start
a fresh lifecycle. Octane still reads a current direct strategy prop while the
boundary is dormant: changing it to `never()` tears down an older installed
trigger so a stale idle, visibility, or interaction callback cannot bypass the
static-HTML exception.

Nested boundaries hydrate parent-first. Interaction intent can wake an
unresolved ancestor chain, after which Octane replays a same-type event for the
target boundary. A `never()` ancestor keeps every deferred descendant inert.
Replay preserves supported platform event classes and their captured keyboard,
pointer, mouse, touch, input, composition, and focus data where the browser can
construct that event. A replayed event is still programmatic: it cannot restore
the original event's trusted status or expired transient user activation.

If activation races a pending renderer-owned streamed Suspense reveal, the
boundary waits for that reveal or its client-render degradation before adopting
the range. Pending reveals inside an independently dormant nested `Hydrate`
boundary remain owned by that nested boundary and do not delay its ancestor.

Ordinary `Hydrate` boundaries render a persistent HTML `<div>`. Account for that
wrapper in layout and HTML nesting; direct placement inside SVG or MathML is
unsupported because an HTML parser moves a `<div>` out of foreign content before
hydration. The exact permanent-static form described above is wrapper-free and
inherits its HTML, SVG, or MathML parser namespace.

For the proposed next step—omitting an inert page shell while independently
hydrating its live islands—see [Static shells and independently hydrated islands](./hydration-islands-plan.md).
That design is not a shipped hydration mode.
