# Investigating Chromium disconnects

Use the **Chromium diagnostics** workflow from the Actions tab when a parity
shard reports an orchestrator WebSocket disconnect. Select the revision in the
workflow's branch selector, the failing shard (default `4/4`), and one to three
independent trials. The workflow is manual; it does not retry or alter ordinary
CI. It becomes available in Actions after merging the workflow into `main`.

Each trial runs the real `scripts/react-parity/check.mjs --shard N/4` entrypoint
on the same Linux runner and Node version as parity CI, with its usual reporters,
native sharding, timeouts and failure semantics. Trials fail independently;
one passing trial does not erase another trial's failure.

Download the trial's artifact within seven days. Every invocation creates a
fresh `run-*` directory containing:

- `browser-resources.jsonl`: revision, command, runtime, memory and disk samples
  every two seconds, Node/Chromium process RSS, descriptor counts and limits,
  and the audit exit status. Missing metrics are reported explicitly. Exited or
  inaccessible processes may be absent from a sample.
- `browser-events.jsonl`: browser/page closure or crash, top-frame navigation,
  WebSocket open/close/error (including Chromium's transport error text), Vite
  reload/closure, provider teardown, and whether the test run had ended.
- `browser-test-report.json`, or `.json.failed`: the parity runner's successful
  report or raw failed report, when Vitest produced one. Failures before browser
  startup can legitimately have no browser events or test report.

Compare timestamps to see whether a socket failure precedes page closure,
server teardown, or resource pressure. These are observations, not proof of
causation. The intermittent disconnect's root cause is still unconfirmed; the
initial controlled trials passed and did not establish memory, disk or file
limit exhaustion. No timeout increase, retry or browser workaround is included.

The lifecycle observer depends on the pinned Vitest Playwright provider. A real
Chromium smoke test in normal CI checks attachment before navigation, transport
errors, premature page closure, normal teardown and retained test failures.
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
