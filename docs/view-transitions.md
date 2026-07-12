# View Transitions

Octane ships React's experimental View Transitions API: the `<ViewTransition>`
boundary component and `addTransitionType`, driving the browser's native
[same-document View Transitions](https://developer.mozilla.org/en-US/docs/Web/API/View_Transition_API)
from the declarative tree. Code written against React's experimental channel
(`unstable_ViewTransition`, `unstable_addTransitionType`) ports unchanged —
octane exports both the plain and `unstable_`-prefixed names.

```tsrx
import { ViewTransition, startTransition } from 'octane';

function Gallery(props) @{
	<>
		@if (props.open) {
			<ViewTransition enter="zoom-in" exit="zoom-out">
				<figure>…</figure>
			</ViewTransition>
		}
	</>
}
// Somewhere in an event handler:
startTransition(() => setOpen(true));
```

## When boundaries animate

A boundary only activates on **transition-lane** commits — updates inside
`startTransition`, `useDeferredValue` re-renders, and Suspense reveals
(fallback → content). Urgent updates, discrete events, and `flushSync` never
animate (they skip an in-flight transition, matching React). Without browser
support (`document.startViewTransition` missing), everything commits
synchronously with no animation — the API is a progressive enhancement.

Activation kinds:

- **enter** — the boundary's subtree was inserted by the commit.
- **exit** — the subtree was removed.
- **update** — content inside the boundary changed, or its size/position did.
- **share** — a `name` appears on both a removed and an inserted boundary in
  the same commit: the browser morphs old → new (a "shared element"
  transition). Share wins over enter/exit; pairs decay to separate enter/exit
  when either side is outside the viewport.
- **parentEnter / parentExit** — a nested boundary inside a subtree that
  entered/exited as one unit is normally silent (only the outermost
  animates); declaring `parentEnter`/`parentExit` (or the matching handler)
  opts it back in, provided every boundary between it and the outermost also
  relays.

## Styling

Each class prop (`enter`, `exit`, `update`, `share`, `parentEnter`,
`parentExit`, plus the `default` fallback) accepts:

- `"auto"` — the browser's default cross-fade;
- `"none"` — deactivate (no animation, no callback);
- a class string — applied as `view-transition-class` alongside the
  boundary's `view-transition-name` for the duration of the transition, so
  CSS can target `::view-transition-group(.my-class)` etc.;
- a per-type map keyed by `addTransitionType` types:

```tsrx
<ViewTransition enter={{ 'nav-back': 'slide-right', default: 'slide-left' }}>
```

```ts
startTransition(() => {
	addTransitionType('nav-back');
	navigate(-1);
});
```

Names are auto-generated per boundary (unique, reverted after the
transition); pass `name` only for shared-element pairs. A boundary with
multiple top-level elements gets suffixed names per element.

## Callbacks

`onEnter` / `onExit` / `onUpdate` / `onShare` / `onParentEnter` /
`onParentExit` fire after the transition is `ready`, receiving
`(instance, types)`: the instance carries the resolved `name` and
`.animate()`-capable handles for the boundary's `old` / `new` / `group` /
`imagePair` pseudo-elements (Web Animations API); `types` is the commit's
`addTransitionType` array. A returned function is a cleanup, run before the
boundary's next activation.

## SSR

Server rendering stamps resolved `vt-*` annotations (`vt-name`, `vt-update`,
`vt-enter`, `vt-exit`, `vt-share`) on each boundary's first element —
boundaries at the top of Suspense content/fallbacks carry their enter/exit
classes, and a boundary wrapping a streaming Suspense gets a stable
auto-name on both the fallback and the streamed content so the swap can pair
old/new captures. Hydration adopts the annotations untouched.

## Notes and intentional divergences

- Octane renders and mutates in one pass, so on wrapped commits the render
  work runs inside `startViewTransition`'s update callback (React renders
  before the snapshot). Observable only as snapshot-hold time.
- `prefers-reduced-motion` is not handled automatically (React parity) — gate
  your transition CSS with a media query.
- One transition runs at a time; work arriving mid-animation batches into the
  next one (A→B, then B→D).
- The full behavior matrix is pinned by the conformance ports in
  `packages/octane/tests/conformance/view-transition*.test.ts`; the
  implementation plan and its documented edge cases live in
  `docs/view-transitions-plan.md`.
