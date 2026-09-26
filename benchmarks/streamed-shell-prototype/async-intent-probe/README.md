# Independent activator event ordering

This focused diagnostic registers a synthetic interaction-triggered independent
island with the public hydration API. Chromium supplies real trusted button
clicks. A promise gate represents asynchronous activation work; there is no SSR
stream, binding view, renderer replay, or application bootstrap in this test.

```sh
PLAYWRIGHT_EXECUTABLE_PATH='/absolute/path/to/authorized/chromium' \
  node benchmarks/streamed-shell-prototype/async-intent-probe/run.mjs
```

The loader control holds module loading before the activator enters. Two clicks
are prevented from bubbling and are both delivered in the activator's initial
`intents` array. The async case holds the activator after entry but before it
attaches a listener: the first click is in that initial array, while the second
reaches the document without prevention and is absent from the array. A third
click after attachment reaches the listener. A synchronous-activator control
also checks that a subsequent click reaches the attached listener. This records
the events supplied to the custom activator; it does not replay their actions.

In the disposal case, registration is disposed while the async activator is
awaiting its gate. The context does not contain a cancellation signal. Releasing
the gate still runs the activator's continuation, and the registry unmounts the
returned handle exactly once afterward. This is not cancellation of pending
work, and it does not establish what happens if a promise never settles.

Each run writes `result.json`, `manifest.json`, and the emitted browser script
to a fresh temporary directory. The manifest hashes the fixture, lockfile and
source inputs reported by the bundler; it is not a complete record of installed
dependencies or the host system.

Signal Chat Metrics uses a **load** trigger and different event-capture paths.
This probe does not establish its behavior, SSR ownership, signal owner,
fallback, or timer equivalence. Ordinary renderer replay validates the original
target and selection before acting; merely receiving an old intent in a custom
activator does not establish a renderer defect. The related streamed-view
replacement diagnostic is in `../metrics-binding-race/`.
