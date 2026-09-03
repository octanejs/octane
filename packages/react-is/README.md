# @octanejs/react-is

The `react-is` 19.2.7 predicates for Octane elements. Replace `react-is` imports
with `@octanejs/react-is` when porting source to Octane.

This binding requires the coordinated Octane core release containing the
behavioral-audit fixes, planned for **Octane 0.2.3**. Its predicates depend on that
release's `StrictMode` export and owner-bound component-kind metadata. Release
and install the binding together with that core version or a later compatible
release. The repository's shared beta peer range is broader than this capability
requirement; it does not establish compatibility with older core releases.

Install it alongside the required Octane release:

```sh
npm install @octanejs/react-is octane@^0.2.3
pnpm add @octanejs/react-is octane@^0.2.3
```

```ts
import { createElement, Fragment, memo } from 'octane';
import { isFragment, isMemo, typeOf } from '@octanejs/react-is';

isFragment(createElement(Fragment, null)); // true
isMemo(createElement(memo(() => null), null)); // true
```

All 26 upstream exports are available. Kind labels use Octane symbols; React
elements are not Octane elements. Component functions themselves are valid
element types, while `isMemo` and `isLazy` inspect element descriptors, as in
`react-is`. Inspection never renders components or starts lazy loaders.

Octane has no Context.Consumer, forwardRef, Profiler, or SuspenseList. Their
predicates return false and their exported kind labels are not valid element
types. Refs are ordinary props; read context with `use` or `useContext`.
StrictMode is the Octane pass-through wrapper and does not double invoke.
`StrictMode` and `Suspense` exported here are classifier labels. Construct
elements with the corresponding functions from `octane`; the labels themselves
are not valid element types. The shared `Fragment` symbol is also Octane's
fragment element type.

See [UPSTREAM.md](./UPSTREAM.md) for the immutable source pin and test crosswalk.
