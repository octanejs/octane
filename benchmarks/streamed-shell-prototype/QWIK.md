# Qwik mechanics relevant to this experiment

This is a source-based comparison, not a Qwik benchmark. The prototype in this
folder uses Octane's current renderer and an explicitly written surrogate; it
does not implement Qwik-style resumability.

- **Build-time boundaries.** Qwik's optimizer extracts `$`-marked component
  bodies and closures into independently addressable symbols. A QRL identifies
  a symbol and its captured, serializable state. The bundler may group multiple
  symbols in a chunk; a symbol is not necessarily one network request. See the
  [optimizer rules](https://qwik.dev/docs/advanced/optimizer/) and
  [bundle optimization guide](https://next.qwik.dev/docs/guides/bundle/).
- **Server-to-client handoff.** Qwik records component boundaries, state,
  subscriptions, and listener references during SSR. The client can restore
  what a requested operation needs without re-executing every ancestor. See
  [resumability](https://qwik.dev/docs/concepts/resumable/) and
  [reactivity](https://qwik.dev/docs/concepts/reactivity/).
- **Event activation.** Qwikloader listens for native events and looks up the
  handler reference emitted into HTML; it can then load the relevant symbol.
  This is asynchronous. Default prevention and propagation need declarative
  handling or a synchronous escape hatch; they cannot be inferred from an
  arbitrary delayed handler. See [Qwikloader](https://qwik.dev/docs/advanced/qwikloader/)
  and [events](https://qwik.dev/docs/core/events/).
- **Updates.** A direct signal-to-text or attribute subscription can update DOM
  without rerunning the component. Structural changes may require its render
  function. See [Qwik component rendering](https://qwik.dev/docs/core/overview/).
- **Prefetch is a separate cost.** Qwik's preloader uses the build's bundle graph
  and SSR-discovered references to preload likely code. Prefetch can reduce
  first-interaction latency while still transferring code that never executes.
  The documented default uses module preloads; measure requested and executed
  bytes separately. See [module prefetching](https://qwik.dev/docs/advanced/modules-prefetching/).
- **Serialization is a constraint.** Qwik can represent several non-JSON values,
  but its docs identify arbitrary class instances and streams as unsupported
  serialization cases. SSR streaming and serializing a live stream are distinct
  questions. See [resumability](https://qwik.dev/docs/concepts/resumable/).

## Implications for Octane

The closest small step is to preserve a compiler-proven direct signal-to-DOM
binding while leaving the enclosing static markup and unrelated components
unexecuted. Octane already has explicit `adoptBindings` artifacts, but its
current contract makes the host responsible for the source, activation, range,
and cleanup. They are not an automatic Qwik-style resume protocol.

An automatic version needs proven component and invocation identities, exact
DOM ranges, state and subscription ownership, context and captured values,
correct stream and boundary ordering, and fallback behavior for future mounts,
rerenders, mismatches, and unsupported values. The bundler graph can map a
proven symbol to an emitted chunk and its dependencies; it cannot by itself
prove component lifetime or erase observable module effects. CSS and effects
of pruned modules must be retained where needed.

A useful next comparison would use the same streamed page and interaction flow
for ordinary hydration, the shell surrogate, and an independently activated
binding. Measure HTML and stream metadata, eagerly requested and eventually
requested JS/CSS, compressed physical files, code actually executed, update and
first-interaction latency, and behavior under delayed modules and client-side
navigation. Test both before- and after-activation stream deliveries and count
fallback code; do not treat prefetch savings as execution savings.
