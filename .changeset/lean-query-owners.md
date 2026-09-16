---
'octane': patch
---

Keep query implementation out of signal-only owner bundles and remove the legacy
`scope.asyncSignal$` method. Explicit-owner callers now import
`createResource(scope, key, describe)`; native `query$` declarations are unchanged.
`createScope` remains optional, and synchronous signals, draft edit receipts,
request isolation, streaming ownership and historical adoption retain their contracts.

Discard compiler-proven unused signal declarations without dropping initializer
effects or diagnostics, and reduce repeated plain-data conversions when accepting
SSR signal seeds. No runtime capability loader or extra initialization phase is added.

Add `bootstrapStreamedSignalResults` for hosts that accept streamed signal results
while owning their HTML placement. It shares the full receiver's authority,
bounded delivery and lifecycle handling without retaining DOM placement code.
The existing `bootstrapStreamedSignalHydration` and region-registration API remain
available unchanged.
