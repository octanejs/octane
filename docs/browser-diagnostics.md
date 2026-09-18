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
original Playwright 1.61.1 / Chromium 149 toolchain. Two consecutive full adapted
runs also passed all 8,709 tests each. Both lanes retain the default
headless-shell configuration and UTC timezone. These controls implicate the
cached module-loading path; they do not establish the browser-internal cause.
Test inventories, assertions, isolation, timeouts and retry policies are unchanged.

The React oracle retains its original test-server settings. Applying the same
header there also exposed the nested context-menu `act()` warning. That change
was removed; the untouched oracle passed all 8,726 tests. Console-error checks
remain enabled in both lanes.

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
