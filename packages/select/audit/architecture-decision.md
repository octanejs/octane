# React Select architecture decision

## Decision

**PROCEED WITH THE PRODUCTION PORT.** The bounded U1 candidate passes every
architecture gate below. The separate generic Emotion binding STOP remains
valid for arbitrary authored `css` props, but does not block React Select's
finite, port-owned style callsites.

An exact `react-select@5.10.2` port requires Emotion-compatible serialization,
class names, cache behavior, client insertion, SSR output, hydration adoption,
ordering, keyframes, and CSP nonces. React Select has a narrower integration
boundary than arbitrary consumer JSX: its finite built-in component set already
centralizes each computed style object immediately before rendering. Those
components must be re-authored for Octane because the pinned Select is a React
class component. A package-specific adapter can therefore call Emotion's pinned
serializer/cache primitives explicitly at those known component boundaries,
without a generic JSX `css` transform or a second renderer identity.

## Reproducible baseline

The candidate is evaluated against Octane commit
`b20a96d277bd57e5ea04b13c2b71a4109eb2d24e` and
`react-select@5.10.2` at canonical commit
`052e864b4990a67c4ee416851c34d1eb7b58267b`.

The npm artifact exposes six JavaScript API entry points and declares direct
runtime dependencies on `@emotion/react@^11.8.1`,
`@emotion/cache@^11.4.0`, and `react-transition-group@^4.3.0`. The pinned
repository lock resolves Emotion React and Cache to `11.9.3`, Serialize to
`1.1.0`, and Utils to `1.2.0`. The canonical React Select source includes 61
files, five Jest suites, five snapshots, and 79 Jest cases. The npm and
repository license files are byte-identical MIT text.

## Why the generic Emotion STOP is not decisive

The separate Emotion architecture audit at commit `eb34ec0f` correctly proves
that arbitrary authored JSX cannot use Emotion's `css` prop while retaining
Octane compiler ownership. An Octane-owned module erases the Emotion `jsx` call
before it can consume `css`, while a host-owned Emotion runtime bypasses Octane
hook-slotting and SSR lowering.

React Select does not require arbitrary authored `css` interception inside the
binding. The port controls every built-in visual component and can convert each
computed `CSSObject` to an Emotion-compatible class before returning Octane
markup. This reuses Emotion's actual serialization and cache algorithms. It is
not an inline-style fallback or a private CSS implementation.

## U1 candidate gates

The candidate must prove all of these before production code is retained:

1. **Serialization identity:** default style objects, nested selectors, media
   queries, labels, and keyframes produce the same serialized names and rule
   text as pinned Emotion.
2. **Class composition:** existing consumer classes, registered Emotion classes,
   React Select prefixes, `classNames`, `unstyled`, and `styles` callbacks compose
   with the same observable class and rule output.
3. **Client cache behavior:** duplicate rules insert once, different cache keys
   remain isolated, insertion order matches the pinned oracle, and nonce-bearing
   style tags retain the requested nonce.
4. **Server behavior:** string, stream, and static rendering collect the same
   Emotion rules without shared cross-request state. The configured renderer
   nonce must cover every emitted style tag.
5. **Hydration:** server-emitted rules are adopted without duplicate insertion,
   rule reordering, or a flash caused by replacing the style channel.
6. **Custom components:** a consumer replacement receives the same style,
   class-name, state, and inner-prop contract as the pinned component pipeline.
7. **No generic hot path:** modules and elements that do not use React Select add
   no import, branch, allocation, or runtime call.
8. **No second renderer:** the candidate remains ordinary Octane DOM output and
   uses the existing CSS collection/insertion facilities.

Any failed gate must classify the cause as candidate defect, Octane gap,
intentional divergence, or proven architecture blocker. Only the last category
may restore a STOP decision.

## U1 result

**PASS.** The executable candidate contains nine Node oracle/client tests and
four compiler-backed Octane SSR tests:

- pinned Emotion output is byte-identical for default styles, nested selectors,
  media queries, labels, linked keyframes, registered classes, and nonces;
- pinned React Select output is byte-identical for the default Control pipeline,
  `styles`, `classNames`, `classNamePrefix`, and `unstyled`, while the exact
  custom Control prop surface is asserted fail-closed;
- client caches deduplicate repeated rules, preserve insertion order and nonce,
  isolate cache keys, and automatically adopt a `data-octane` server rule;
- real Octane string, static, and streaming renderers collect the exact rule
  text, apply renderer nonces, emit streaming styles before their consumer, and
  isolate dynamic rules across requests; and
- the adapter imports no React renderer and changes no generic Octane path. It
  produces an ordinary class for ordinary Octane DOM and injects through the
  existing CSS channel supplied by the caller.

Run `pnpm --filter @octanejs/select-u1 test` to execute the complete U1
evidence. This result authorizes pinned source/test vendoring and the first
production parity unit; it does not waive any interaction, accessibility,
entry-point, browser, type, or release gate below.

## Full-port interaction and accessibility contract

Passing U1 proves only the style boundary. The later port must derive and
execute a state/interaction matrix from the pinned suite and source. At minimum
it covers:

- keyboard navigation, selection, clearing, escape, tab, and typeahead;
- focus entry, restoration, disabled transitions, blur, and portal continuity;
- composition input, screen-reader labels and relationships, live-region
  guidance/results/selection announcements, and invalid state;
- mouse and touch behavior, scroll capture/locking, and document scrolling;
- automatic menu placement, fixed and absolute positioning, portal targets,
  viewport edges, clipping, and container scrolling;
- empty, loading, disabled, focused, selected, invalid, clearing, creating, and
  asynchronous success/failure states; and
- default, unstyled, prefixed-class, `classNames`, and `styles` presentation for
  every user-visible state.

These are observable parity requirements, not implementation suggestions. The
upstream suite is the starting oracle, not evidence that the matrix is complete.

## Other dependency work

The pinned Select class lifecycle, focus, composition, touch, scroll, and
derived-state behavior must be re-authored as a functional Octane component and
proved against the complete pinned suite. Non-production test adaptation may
start after U1 while release work remains gated on all dependencies.

The animated entry point also depends on `react-transition-group`. The merged
`@octanejs/transition-group` binding supplies the exact Octane behavior used by
React Select's animated entry point.

## Rejected substitutes

### Inline-style serializer

Serializing returned objects into `style` attributes cannot preserve nested
selectors, media queries, keyframes, cache ordering, nonce-bearing style tags,
or Emotion's public cache semantics.

### Class-name-only or `unstyled` binding

Restricting the package to `unstyled`, `classNames`, or `classNamePrefix`
removes the default visual contract, `styles`, `mergeStyles`, and
`NonceProvider`. The user-approved tracker requires equivalent package
bindings, not a differently named headless substitute.

### Private Emotion clone

Reimplementing Emotion would create a second incompatible cache and CSS runtime.
The candidate must reuse pinned Emotion serialization/cache primitives and
prove their output, not approximate them.

## Next decision

Continue to pinned source/test vendoring, the six-entry-point crosswalk, and the
functional Select reimplementation. Retain U1 as a permanent fail-closed gate.
