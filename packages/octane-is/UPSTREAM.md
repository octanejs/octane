# Upstream boundary

- Package: `react-is@19.2.7`.
- Source: https://github.com/facebook/react/tree/6117d7cca4906492c51fe6a03381e35adfd86e7d/packages/react-is
- Immutable commit: `6117d7cca4906492c51fe6a03381e35adfd86e7d`.
- License: MIT. `LICENSE.upstream` retains the exact Meta notice and permission.
- npm integrity: `sha512-kZFnouyVv7eP/Phmrlo9FK+zcAdriZJvzxXHF1Sl1P377WSGe2G/JxVolhTrB/jeV47lKImhNUsijjHAAbcl/A==`.

`audit/upstream.lock.json` pins every pristine source and test blob. `src/ReactIs.ts`
adapts `src/ReactIs.js`; `src/index.ts` mirrors `index.stable.js`. Runtime ownership
is Octane's `$$kind`, callable context, memo marker and lazy marker. No React
runtime dependency or React element branding ships.

## Octane release requirement

Publish this binding with the coordinated Octane core release containing the
behavioral-audit fixes, planned for **0.2.3**. Earlier releases do not supply the
required `StrictMode` export and owner-bound component-kind metadata. Validation
uses the current workspace core containing those changes. The shared beta peer
range is mandated by repository source and tarball validation; it is not a claim
that earlier core releases implement these capabilities. Shipping this binding
before the coordinated core release would expose an unresolved runtime dependency.

## Source boundary

The two authored TypeScript source modules adapt only the pinned `react-is`
package's `src/ReactIs.js` and `index.stable.js`. The pinned npm artifact supplies
the pristine runtime oracle. The copied upstream source, tests and npm artifact
stay outside published files; their exact licenses and hashes are retained.

The complete published surface is accounted for: `typeOf`, `isValidElementType`,
`ContextConsumer`, `ContextProvider`, `Element`, `ForwardRef`, `Fragment`, `Lazy`,
`Memo`, `Portal`, `Profiler`, `StrictMode`, `Suspense`, `SuspenseList`,
`isContextConsumer`, `isContextProvider`, `isElement`, `isForwardRef`, `isFragment`,
`isLazy`, `isMemo`, `isPortal`, `isProfiler`, `isStrictMode`, `isSuspense`, and
`isSuspenseList`.

Consumer, ForwardRef, Profiler and SuspenseList labels/predicates remain exported,
but cannot identify a supported Octane kind: those predicates return false and
their labels are not valid element types. Octane function refs need no forwarding
wrapper. StrictMode identifies the pass-through wrapper without promising double
invocation. React Server Component references and arbitrary `getModuleId` objects
are not valid Octane types. These are deliberate differences, covered by tests.
The exported StrictMode and Suspense symbols label the corresponding Octane
wrapper functions; use those functions from `octane` to construct elements.
Classifier symbols do not grant rendering support. Fragment is the shared
exception: its symbol is also Octane's fragment element type.

The pinned package ships no TypeScript declaration files or type tests. Strict
authored/public/packed-source type consumers validate this binding's declarations.
The pinned Flow implementation informs the authored signature crosswalk; no
separate upstream TypeScript suite is invented. The full public type consumer
asserts all 26 exports and rejects invalid calls and return assignments.
The upstream runtime inventory has 14 cases; its experimental SuspenseList case
is inapplicable to the pinned stable package. Supported cases run against the
pinned original and the adapted Octane suite; unsupported kinds retain explicit
negative controls. See the machine crosswalk in `audit/`.
