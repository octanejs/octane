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

`interaction()` listens for `pointerenter`, `focusin`, `pointerdown`, and
`click` by default. Supported custom events are `auxclick`, `click`,
`contextmenu`, `dblclick`, `focusin`, `keydown`, `keyup`, `mousedown`,
`mouseenter`, `mouseover`, `mouseup`, `pointerdown`, `pointerenter`,
`pointerover`, and `pointerup`.

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

Generated Hydrate chunks are not eagerly module-preloaded. The Vite and Rsbuild
app integrations still link CSS reachable from a route's deferred chunks,
because that route's server HTML needs its styling before the child JavaScript
loads. This eager CSS collection follows the route entry's asset graph; it does
not turn deferred JavaScript into an eager dependency.

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
Native event payload details such as pointer coordinates are not guaranteed to
survive replay.

`Hydrate` always renders a persistent HTML `<div>`. Account for that wrapper in
layout and HTML nesting. Direct placement inside SVG or MathML is unsupported,
because an HTML parser moves a `<div>` out of foreign content before hydration.
