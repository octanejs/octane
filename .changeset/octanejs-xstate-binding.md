---
'@octanejs/xstate': patch
---

Add `@octanejs/xstate`, a port of `@xstate/react@6.1.0`.

`xstate` itself is framework-neutral and is consumed unmodified as a peer
dependency; only the React binding is ported, module for module, with `src/`
mirroring the upstream layout so the two trees read side by side. Every export
of the pinned entry point is accounted for in `UPSTREAM.md`: `useActor`,
`useActorRef`, `useSelector`, `useMachine`, `createActorContext`, and
`shallowEqual`. Two of upstream's npm dependencies are React-specific and are
replaced rather than consumed —
`use-sync-external-store/shim/with-selector` keeps its exact memoization
algorithm on Octane's native `useSyncExternalStore`, and
`use-isomorphic-layout-effect` becomes a slot-forwarding helper.

The pinned release's own suite is the parity oracle, run both ways. The
`xstate-pristine` lane spawns the byte-exact vendored suite against
`@xstate/react@6.1.0` and `react@19.2.3` (144 of 144 cases), and
`xstate-adapted-upstream` reruns the same 75 case identities on Octane through
TSRX fixtures. Both type suites run too: the vendored one under plain `tsc`, and
a one-for-one adapted one under `tsrx-tsc`. A differential lane drives one
fixture through this binding and through the real `@xstate/react`, asserting
byte-identical `innerHTML` after every click with `xstate@5.32.5` shared by both
sides, so any difference is attributable to the binding.

Four divergences are recorded in `audit/react-parity.json`, each bound to the
cases that pin it. Octane has no StrictMode double-invoke, so upstream's eight
`suiteKey === 'strict'` counts collapse to their non-strict values; error
boundaries are `@try`/`@catch` blocks rather than class components;
`useSyncExternalStore` gates its commit-time sync on the value instead of
re-reading `getSnapshot`, which is unreachable for actors that notify; and the
server snapshot is optional and falls back to `getSnapshot` where React throws.

`createActorContext` stays plain `.ts` on purpose: its returned hooks forward
the caller's compiler-assigned slot, and a compiled `.tsrx` would append its own
symbol after the forwarded one and collapse every consumer call site onto a
single hook cell.
