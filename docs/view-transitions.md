# View Transitions

Octane supports the View Transitions API stabilized in React 19.3: the `<ViewTransition>`
boundary component and `addTransitionType`, driving the browser's native
[same-document View Transitions](https://developer.mozilla.org/en-US/docs/Web/API/View_Transition_API)
from the declarative tree. Octane also retains the compatibility aliases
`unstable_ViewTransition` and `unstable_addTransitionType`, and supports React's
experimental parent enter/exit relays.

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
(fallback → content). Urgent updates and `flushSync` never animate. An urgent
update skips active transitions it touches; `flushSync` skips all active scopes.
Event handlers can opt updates into animation with `startTransition`. Octane uses the native options overload (`document.startViewTransition({ update, types })`)
and detects older callback-only implementations once per native function. Those
implementations animate without native transition types. Without the native API,
updates commit without animation. Unexpected native failures reach the root’s
`onRecoverableError` handler (or the console) and still publish the update.

Activation kinds:

- **enter** — the boundary's subtree was inserted by the commit.
- **exit** — the subtree was removed.
- **update** — content inside the boundary changed, or its size/position did.
- **share** — a `name` appears on both a removed and an inserted boundary in
  the same commit: the browser morphs old → new (a "shared element"
  transition). Share takes precedence over enter/exit, including named
  descendants of entering subtrees. Offscreen captures are suppressed.
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

All matching types contribute classes in insertion order; any matching `none`
suppresses that activation. An unmatched event map falls back to `default`.
Types also reach the browser's `:active-view-transition-type()` selector.

Omitting `name`, or passing `name="auto"`, gives a boundary a stable generated
name. Use explicit names for shared-element pairs. Multiple top-level elements
get suffixed names and are all measured. Temporary names and classes are
restored to their authored values after capture.

## Element scopes

`scope="element"` is an Octane extension for native
[element-scoped transitions](https://developer.mozilla.org/en-US/docs/Web/API/View_Transition_API/Using_element-scoped):

```tsrx
<ViewTransition scope="element">
	<section class="panel">
		<ViewTransition name="content" update="fade">
			<p>{text as string}</p>
		</ViewTransition>
	</section>
</ViewTransition>
```

The declaration must contain exactly one persistent direct host, with no visible
text siblings. Octane adds no wrapper. Descendant boundaries inherit the nearest
scope; omitted scopes otherwise use the document. Portals outside a declared
host do not animate in that scope. Newly mounted, removed, replaced, or invalid
scope hosts commit normally without a document animation fallback.

Names and shared-element matching are local to each scope, so separate panels
can both use `name="content"`. Sibling scopes can animate independently, and a
nested scope can begin after its ancestor finishes capture while the ancestor's
animation continues. Updates to an ancestor that might remove an active child
scope wait for that child. `flushSync` interrupts all active scopes; ordinary
urgent work interrupts the scopes it touches.
If draining pending passive effects introduces urgent work into a transition
batch, the whole batch commits without animation.

The scope host retains native self-participation and clipping. Its default name
is `root`; authored `view-transition-name` overrides that default, and an explicit
boundary `name` takes precedence during capture. Authored `view-transition-name:
none` excludes the host's own group and callback, while named descendants can
still animate. A shared stylesheet rule applies `view-transition-scope: all
!important` to the host's `vt-scope="element"` marker in its own document. An
authored inline `view-transition-scope: none !important` overrides that rule.
Removing the declaration removes its marker and leaves authored styles intact.

Pseudo-element handles address the scope host. Outside controls stay interactive.
Several scopes participating in one update share one DOM publication and one
layout phase; callbacks and their cleanup follow each native scope's lifetime.

Element transitions are a progressive enhancement, detected through
`Element.startViewTransition`. Browsers without it commit the scoped update
without animation. Document transitions keep their existing support requirements;
the framework's minimum browser version is unchanged. Native scope coverage runs
in Chromium 149 without feature flags.

## Callbacks

`onEnter` / `onExit` / `onUpdate` / `onShare` / `onParentEnter` /
`onParentExit` fire after the transition is `ready`, receiving
`(instance, types)`: the instance carries the resolved `name` and
`.animate()`-capable handles for the boundary's `old` / `new` / `group` /
`imagePair` pseudo-elements (Web Animations API); `types` is the commit's
`addTransitionType` array. A returned function runs when that native transition's
`finished` promise settles, including after an exit unmounts the boundary.

Each pseudo-element handle supports `animate()`, `getAnimations()`, and
`getComputedStyle()`. A boundary's `ref` receives the same stable instance;
object refs and callback refs, including callback cleanup, follow layout lifetime.
For an unnamed element scope, that stable ref follows the host's committed CSS
name, including updates made by a child. Its pseudo-element properties resolve
the current name; a pseudo-element handle already read keeps its original name
and host target. Explicit names and document boundaries retain fixed instances.

## SSR

Server rendering annotates each top-level host in a boundary. The optional
streaming driver consumes those annotations to animate Suspense fallback/content
replacements before hydration, including shared elements and parent relays.
Hydration adopts the existing hosts. Server reveals and client commits coordinate
through the native handle for their document or element scope.

`scope="element"` also works before hydration. Its one persistent direct host
matches the shared `[vt-scope="element"]` stylesheet rule declaring
`view-transition-scope: all !important`; nested streamed replacements
use that element's native transition. Sibling scopes may animate independently,
and nested scopes keep their names and captures separate. A reveal waits for an
earlier animation on the same scope, while an independent scope can proceed.
If a batch includes document and element captures, all capture callbacks publish
the streamed replacements together.

Keep the scope host outside the Suspense boundary whose fallback will be
replaced. Missing or multiple hosts, direct visible text beside the host, and a
replaceable fallback host skip animation. Browsers without element transition
support also reveal scoped content without animation. These cases do not widen
the capture to the document. Hydration preserves the host and its authored inline
styles. An inline `view-transition-scope: none !important` overrides the shared
rule. Removing the scope removes its marker and leaves authored styles intact.

## Commit ordering

Octane prepares the next tree before the old snapshot, while existing DOM and
committed handlers remain visible. The finished boundary props select old-capture
participation and classes, including nested `update="none"` suppression. Old and
new snapshots each retain their corresponding name. The native update callback publishes the ordered DOM changes once, together with insertion effects
and outgoing layout cleanup. Newly requested fonts and eligible visible images can delay layout refs
and effects by up to 500 ms. The new snapshot waits for a navigation that was
already pending before mutations. Resource failures or the timeout allow the
commit to continue. Lazy and offscreen images do not hold the capture. As in
React, an image with an `onLoad` handler opts out of the client resource wait.

Urgent work finishes pending layout work and skips the animation. Unchanged or
`none` boundaries do not receive separate new captures. The default root overlay
is suppressed so controls outside animated regions remain interactive.
Actionable native failures are sent to the root's `onRecoverableError` handler;
otherwise they are logged, and the update still commits.

## Notes and intentional divergences

- `prefers-reduced-motion` is not handled automatically (React parity) — gate
  your transition CSS with a media query.
- One transition runs at a time **per scope**; work for a busy scope batches into
  its next animation (A→B, then B→D). A batch that touches several scopes waits
  for all of them, then publishes one DOM commit.
- Gesture transitions (`useSwipeTransition` /
  `unstable_startGestureTransition`) are not implemented — they are still
  experimental in React and explicitly deferred until React stabilizes them.
- React ports live in `packages/octane/tests/conformance/view-transition*.test.ts`.
  Octane feature coverage lives in `packages/octane/tests/view-transition*.test.ts`
  and the native browser suites. `docs/view-transitions-plan.md` records the
  architecture, the decision to add staged commits, and remaining limits.
