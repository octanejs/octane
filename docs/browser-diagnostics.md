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
the full adapted suite, after 8,481 passing assertions. It also reproduced while
only loading the test files, including with diagnostics disabled. The browser
closed both the orchestrator and tester WebSockets before server/provider
teardown, without a page crash or navigation. Chromium reported an empty
transport error; its internal cause is still unconfirmed.

The adapted Base UI browser config now selects `launchOptions.channel: 'chromium'`:
[Chromium's new headless mode](https://playwright.dev/docs/browsers#chromium-new-headless-mode),
using the same Playwright-pinned browser version rather than an installed system
Chrome. Two complete 315-file loading probes and all 8,709 adapted assertions
passed with this mode. The existing CI Chromium install supplies both binaries;
no additional download step is needed.
Test inventories, assertions, isolation, timeouts and retry policies are unchanged.

The React oracle retains its existing headless-shell configuration, which passed
all 8,726 tests in the full browser suite. Moving the oracle to new headless mode
repeatedly triggered React `act()` warnings in the nested context-menu pointer
test, despite that file passing in isolation. This change does not suppress or
accommodate those warnings: it only changes the adapted lane that reproduced the
transport failure. Both lanes retain the same pinned Chromium version and UTC
timezone, but use different headless implementations.

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
