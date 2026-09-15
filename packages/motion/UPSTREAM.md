# Motion upstream ledger

This binding targets `framer-motion@13.2.0` and its `motion@13.2.0`
wrapper, both published from commit
`e871ba7f175d0609cef84f416f984e8e84be8333` in
`https://github.com/motiondivision/motion.git`. Both are MIT licensed.
The runtime consumes the framework-neutral `motion` and `motion-dom`
packages; React remains a test-only oracle.

## Source boundary

`src/engine.ts` directly forwards the upstream engine; `src/index.ts` preserves
the existing public entry. `src/native.ts` and its helpers implement Octane host
components, context, hook slots and lifecycle integration. It retains the existing native contracts, including cleanup before
DOM detachment and bounded FLIP layout. The animation engine is imported from
upstream. `audit/closure.json` records every reachable source file and dependency. The
validated mixed-ownership policy retains all copied-source, upstream runtime
and type evidence; it does not remove any of the 844 registrations.

`upstream/` contains the exact Framer package source, tests, package metadata,
README and member license at the immutable commit. All 313 files are checked
offline against their Git blob hashes in `audit/upstream.lock.json`.
`upstream-artifact/` retains the SRI-verified npm archives, exact declarations
and licenses, and the complete previous native source receipt.
`audit/provenance.json` checks those artifacts; `LICENSE` and
`LICENSE.upstream` retain the root and member attribution in the published package.
Evidence directories are excluded from the published file allowlist.

## Runtime evidence

The pristine oracle runs all 101 upstream client and SSR test files with the
upstream-compatible React 18.3.1 and Jest 29.7.0 environment. There are 844
static registrations and 870 passing runtime expansions. Seven tests disabled
in the upstream source are retained separately and never counted as passing.
`audit/pristine-runtime.json` lists the observed identities; the wrapper checks
that complete list on every replay. No upstream package lifecycle script runs.

The five `useMotionValue` cases are adapted one-for-one. Their native test is
regenerated from the lock, mechanical rewrites and a committed patch. The patch
uses Octane's fixture mounting and preserves its documented zero-transform
serialization difference. Separate native conformance suites cover the binding's
supported animation, context, hook, gesture, exit, layout, and cleanup contracts.
These tests are distinct from the full upstream React oracle.

Shared React/Octane fixtures check host rendering, filtered props, child updates,
nested `isValidProp` inheritance and overrides, live filter replacement, and clicks.
Chromium checks native events, focus and survivor identity, real MotionValue
animation, hydration adoption of deterministic server hook output, and unmount.
Production-bundle consumers check unused binding removal and development behavior
without a global `process` object. A separate Node test initializes the hooks
without DOM effects.

## Public declarations

`audit/public-exports.json` accounts for every Framer export, the binding's native
additions, and the named HTML/SVG host entry. Strict public assertions check both
native entrypoints and the pinned Framer declaration entry. The neutral root is
witnessed by `framer-motion/dom`; hook declarations are witnessed separately by
Framer's React entry. Native component calling conventions, feature bundles,
contexts, and native-only types are authenticated against the complete previous
source inventory in `audit/compatibility-baseline.json`.

Five registrations in two `types.test.tsx` files combine typed examples with
runtime observations. Their type contracts have paired, structurally mapped
assertion groups in the pristine and adapted programs; the original runtime
observations execute in the complete pristine suite. Additional handwritten
inference and negative controls cover values, springs, transforms, scoped
animation, event callbacks and prop predicates.

## Supported scope and remaining gaps

This is a bounded native integration. Passing the full pristine React suite does
not establish full native React Motion parity. In particular:

- `AnimatePresence` retains cleanup-before-detach behavior, without React's full
  deferred presence tree, modes, presence hooks or custom presence data.
- `layout` and `layoutId` use bounded FLIP, without nested projection, child scale
  correction, or shared layout during drag.
- Initial-only targets do not materialize styles without an animation target.
- Drag momentum and elastic physics, output-map `useTransform`, child sequencing,
  custom React component factories, Reorder, and unexported React hooks remain gaps.
- Native `MotionConfig` supports transition defaults, reduced motion and scoped
  `isValidProp`; React's additional configuration and transition-inheritance APIs
  are not claimed by this update.
- Component animations write DOM targets directly. They do not write animated
  values back into external style MotionValues, implement `onUpdate` or
  `onAnimationStart`, or restore removed target keys through React's animation
  state. MotionValue events and imperative animation callbacks are separate APIs.
- Gesture callbacks, gesture priority/propagation, SVG attribute MotionValues,
  and MotionValues as text children are not implemented. Ordinary SVG hosts,
  attributes and refs are covered by native and Chromium tests.
- The four supported `useTransform` forms capture their input identities and
  mapping when mounted; replacement inputs/ranges on rerender remain a gap.
- Hook initialization and hydration have explicit server coverage. Motion host
  components themselves remain client-only.

Motion 13.2.0's engine has an observed unit-string limitation: `attachFollow`
with `skipInitialAnimation: true` turns a first source change from `10%` to `25%`
into `25%%`. This reproduces using the engine alone, without importing Octane.
Numeric skip-initial springs and ordinary animated unit-string springs have
separate passing native coverage; the combination above is not claimed.

The update preserves supported imports and these existing native distinctions.
It adds scoped prop filtering and precise supported hook declarations while
updating the reused animation engine to 13.2.0. It also fixes `useSpring`
retaining its old source subscription when a new MotionValue is supplied.
