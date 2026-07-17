---
'octane': patch
---

`octane/react` islands now read REAL React 19 contexts transparently: an
island's ordinary `use()`/`useContext()` accepts a `React.Context<T>` object
(typed via a structural overload that keeps React types out of the core
package), resolves it through the owner bridge to a root-local mirror,
bootstraps the committed nearest-provider value from the host Fiber once, and
stays live by subscribing through real `React.use(context)` reads in the
wrapper — provider-only updates flow through memoized parents with zero
post-subscription Fiber walks, `memo()` consumers inside the island are
invalidated correctly, and islands never observe each other's providers. When
Fiber inspection is unavailable (or a providerless read needs the context
default), a request handshake retries with the authoritative React value
before paint. Reading a React context outside a hosted island now throws a
targeted diagnostic, and `useContext()` rejects non-context arguments instead
of silently returning `undefined`.
