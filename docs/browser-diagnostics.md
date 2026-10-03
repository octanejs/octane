# Investigating Chromium disconnects

Use the **Chromium diagnostics** workflow from the Actions tab when a parity
shard reports an orchestrator WebSocket disconnect. Select the revision in the
workflow's branch selector, the failing shard (default `4/4`), and one to three
independent trials. The workflow is manual; it does not retry or alter ordinary
CI. It becomes available in Actions after merging the workflow into `main`.

Each trial runs the real `scripts/react-parity/check.mjs --shard N/4` entrypoint
on the same Linux runner and Node version as parity CI, with its usual reporters,
native sharding, timeouts and failure semantics. Trials fail independently;
one passing trial does not erase another trial's failure. The diagnostic audit
step is limited to 25 minutes within a separately budgeted job, leaving time to
upload evidence if the audit hangs; test-level timeouts remain unchanged.

Download the trial's artifact within seven days. Every invocation creates a
fresh `run-*` directory containing:

- `browser-resources.jsonl`: revision, command, runtime, memory and disk samples
  every two seconds, Node/Chromium process RSS, descriptor counts and limits,
  and the audit exit status. Missing metrics are reported explicitly. Exited or
  inaccessible processes may be absent from a sample.
- `browser-events.jsonl`: page closure or crash, top-frame navigation,
  WebSocket close frames and transport error categories, server TCP socket
  events, and Vite/provider teardown, using the existing parity observer.
- `browser-test-report.json`, or `.json.failed`: the parity runner's successful
  report or raw failed report, when Vitest produced one. Failures before browser
  startup can legitimately have no browser events or test report.

Compare timestamps to see whether a socket failure precedes page closure,
server teardown, or resource pressure. These are observations, not proof of
causation. The intermittent disconnect's root cause is still unconfirmed; the
initial controlled trials passed and did not establish memory, disk or file
limit exhaustion.

## Base UI headless transport

The September 18 failure reproduced locally in Chromium headless shell during
the full adapted suite, after 8,481 passing tests. It also reproduced while
only loading the test files, including with diagnostics disabled. The browser
closed both the orchestrator and tester WebSockets before server/provider
teardown, without a page crash or navigation. Chromium reported an empty
transport error; its internal cause is still unconfirmed.

Changing Chromium 149 from headless shell to new headless mode was not sufficient:
one complete run passed all 8,709 adapted tests, but a repeat disconnected
after 7,235. Moving the React oracle to that mode also triggered `act()` warnings
in a nested context-menu pointer test. Neither failure was suppressed.

Playwright 1.63.0 / Chromium 153 also disconnected on a repeated full run, after
7,034 passing tests, so the toolchain remains unchanged. Navigation-start
and HMR tracing did not observe a reload request before the disconnect.

The adapted Base UI browser test server now sends `Cache-Control: no-store`. Three
consecutive complete 315-file loading probes passed with this setting on the
original Playwright 1.61.1 / Chromium 149 toolchain. Four consecutive full adapted
runs also passed all 8,709 tests each. Both lanes retain the default
headless-shell configuration and UTC timezone. These controls implicate the
cached module-loading path; they do not establish the browser-internal cause.
Test inventories, assertions, isolation, timeouts and retry policies are unchanged.

The React oracle retains its original test-server settings. The nested
context-menu `act()` warning occurred both with the no-store experiment and in an
untouched reference repeat (8,725 passes, one failure), after an untouched run
passed all 8,726 tests. It is an independent intermittent baseline failure, not
evidence that the header caused it. Console-error checks remain enabled.

## Intersection Observer cold dependency reload

A separate cold-start failure aborted the adapted Intersection Observer browser
test import: Vite discovered `devalue` during the import, rebuilt its optimized
dependencies, and reloaded the running test. This lane now preloads
`octane > devalue`, the nested dependency used by Octane's RPC client.
The browser-tooling regression runs the existing two behavior tests from a fresh
cache and rejects Vitest's unexpected-reload warning. It fails with the original
configuration and passes with the preload; five additional cold starts also
passed without the warning. No test cases or assertions were removed.

## Browser mock interception race

On loaded Linux runners, a browser test file could occasionally import the real
module right after its own `vi.mock`. The browser-tooling collection regression
failed this way. `@vitest/browser-playwright` 4.1.10 applies browser mocks
through `context.route()`, and clearing mocks between files removes every
route. Playwright 1.61.1 sends `Fetch.enable` again only when the route count
goes from zero to one, and Chromium applies it after acknowledging the command.
A module request issued within a millisecond of that acknowledgement can
therefore bypass the mock route (vitest-dev/vitest#8339).

`patches/@vitest__browser-playwright@4.1.10.patch` backports the upstream fix,
vitest-dev/vitest#11083, which is not in any 4.x release. On a context's first mock
registration, the provider installs a route that fulfils
`/__vitest_interception_probe__`. It then fetches that URL until the response
proves interception is live, and only then adds the mock route. The probe route
stays installed, so interception remains on for later files. The patch covers
every lane that uses the `playwright()` provider, including the adapted and
pristine Base UI browser lanes.

With `DEBUG=pw:protocol`, the 20 adapted Base UI browser files that call
`vi.mock` sent `Fetch.enable` and `Fetch.disable` 20 times each without the
patch. Each file's first paused request arrived 0–2 ms after `Fetch.enable`.
With the patch, the same files sent `Fetch.enable` once and `Fetch.disable`
never, and the probe was answered before the first mocked module was requested.
The collection regression in `test-utils/vitest-browser-collection.test.ts`
fetches the probe after its mocked import, so it fails when the patch is
missing. Drop the patch when Vitest is upgraded to a release that contains the
fix.

## Observer constraints

The lifecycle observer depends on the pinned Vitest Playwright provider and
attaches after the initial page navigation. A real Chromium smoke test in normal
CI checks transport error capture, premature page closure, normal teardown and
retained test failures.
The observer adds some overhead; an instrumented pass cannot rule out a timing
race in ordinary CI.

For a local run after installing dependencies and Chromium:

```sh
node scripts/react-parity/browser-diagnostics.mjs --shard 4/4 --output-dir /tmp/octane-browser-diagnostics
```

Linux provides `/proc` resource metrics. On other platforms the audit and browser
trace still run and unavailable resource metrics are marked. Diagnostic events
omit WebSocket payloads, HTTP headers, command-line arguments of sampled processes,
and URL credentials/query/fragment values. Raw test reports and console output
retain their normal contents; review those before sharing an artifact publicly.
