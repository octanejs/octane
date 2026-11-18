Run the pinned scroll-to-last diagnostic separately from the normal parity inventory:

```sh
OCTANE_VIRTUAL_BROWSER_MODE=pristine OCTANE_VIRTUAL_REPLAY_SEED=123 node packages/tanstack-virtual/node_modules/@playwright/test/cli.js test --config packages/tanstack-virtual/tests/scroll-replay.config.ts
OCTANE_VIRTUAL_BROWSER_MODE=adapted OCTANE_VIRTUAL_REPLAY_SEED=123 node packages/tanstack-virtual/node_modules/@playwright/test/cli.js test --config packages/tanstack-virtual/tests/scroll-replay.config.ts
```

Each run writes a JSON attachment under the system temporary directory. It records the seed, browser and pinned versions, observed per-index heights, last-row viewport intersection, and scroll geometry sampled for 3.5 seconds after the click. It checks a comparable threshold at the sample nearest one second; the upstream test instead waits one second, invokes Playwright's visibility assertion, then reads the gap.

Set `OCTANE_VIRTUAL_REPLAY_DELAY_MS=400` to induce a page-wide animation-frame delay after the click. This optional control captures 6.2 seconds, beyond the pinned core's five-second command horizon, and records held, canceled, and released callbacks. A nonzero test exit is expected when the induced case reproduces the gap; the JSON attachment is written before the threshold assertion.

For the minimally instrumented control, repeat the same command with `OCTANE_VIRTUAL_REPLAY_SAMPLE_MODE=oneshot`. It reads geometry only before the click, near one second, and at the end. Compare its observed index-height map and gap with the trajectory attachment from the same lane, seed, and delay.

The sampler can perturb layout, and transient rows may appear between samples. Replay a failing seed with a minimally instrumented one-shot control and compare the observed index sets and heights before attributing a difference to the renderer: an equal global RNG seed alone does not guarantee equal heights per row across renderers. The delay affects all page animation-frame consumers and does not establish the cause of historical CI failures.

The original upstream and adapted tests and their geometry tolerance remain unchanged. A persistent gap needs a focused pinned-core reproduction; a bounded replacement assertion requires evidence that the same failing geometry converges.
