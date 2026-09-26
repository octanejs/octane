# Signal Chat

A local ChatGPT-style application for exploring Octane's streaming SSR signals.
It extends the [conversation-streaming benchmark](../../benchmarks/conversation-streaming)
into an interactive lab: a transcript, native composer, recent chats, tool
activity, configuration controls, and downloadable evidence. All data and delays
are deterministic. No model account or external service is required.

```sh
pnpm --dir examples/signal-chat dev
# http://127.0.0.1:5237

pnpm --dir examples/signal-chat typecheck
pnpm --dir examples/signal-chat build
pnpm --dir examples/signal-chat preview
pnpm --dir examples/signal-chat test:e2e
pnpm --dir examples/signal-chat test:capture
```

The production command builds both client and server through the standard Octane
fullstack host. Browser tests use a dynamically allocated loopback address;
`SIGNAL_CHAT_EXAMPLE_BASE_URL` targets an existing server. The normal dev and preview
commands use port 5237.

## Experiments

The public shell and composer arrive before a simulated session dependency.
Three `query$` streams then start independently: answer, recent chats, and tool
activity. Each async-generator yield is a cumulative, serializable value.

- `/` defers each data panel until interaction. Its first result arrives as
  server HTML; later values travel as data. Click **Activate conversation**,
  **Activate history**, or **Activate tools** to adopt existing nodes and catch up.
- `/eager` activates the same panels on load. Use identical data and timing
  settings when comparing the two modes.
- Type before client code arrives. The composer uses `value={draft$}`, derived
  character count, native input capture, and interaction hydration. Send with
  the button or Ctrl/Command + Enter. Further messages use real module-server
  streaming calls through the same query API.
- **Stop response** selects `skip` and retains the last accepted value.
  **Resume response** starts a new generation. Send overlapping prompts to
  exercise cancellation and stale-response fencing.
- **Refresh response** uses `refetch()` and retains usable content while loading.
  **Reset response** uses `reset()` and returns strict reads to pending.
- `fail-before`, `fail-after`, and `empty` exercise resource errors. A failed
  partial response remains visible through `.latest()`. **Retry response**
  selects a healthy producer with a fresh generation.
- `burst` groups yields without inter-yield timers; `unicode` adds grapheme,
  emoji, RTL, and HTML-escaping payloads. These modes stress delivery and
  coalescing without pretending to measure model-token throughput.

The **Design a run** form reloads with a shareable configuration URL. Query
parameters are `scenario`, `q` (initial prompt), `auth`, `answer`, `history`,
`interval` (milliseconds), `waves` (1–64), `turns` (1–200), `historyRows`
(1–200), and `hydrateDelay` (0–5000 ms, delaying the composed shell; independent
widgets can activate sooner). An omitted or blank `historyRows` uses the turn
count, preserving the default behavior.
Producer delays are capped at 2000 ms. `run` supplies an optional
diagnostic ID; otherwise the server creates one. `observe=0` disables the browser
DOM observer for a control run. Initial streams are finite; this is not a
permanent chat transport or an authentication example.

The history and conversation sizes can be chosen independently. These local
profiles align the turn count, history count, first-result delays, and wave
count with scenarios in the [conversation-streaming benchmark](../../benchmarks/conversation-streaming):

| Profile | URL |
| --- | --- |
| Body first | `/?auth=30&answer=8&history=25&interval=8&waves=1&turns=20&historyRows=10` |
| History first | `/?auth=30&answer=25&history=8&interval=8&waves=1&turns=20&historyRows=10` |
| Large conversation | `/?auth=30&answer=8&history=25&interval=8&waves=4&turns=200&historyRows=60` |

These are synthetic workload dimensions, not samples from Lightweight Web.
The apps use different content, markup, and producers (Signal Chat also has a
tools stream), so matching these settings does not make their timings or bytes
directly comparable. Compare baseline and candidate builds of the same app and
profile.

Browser commands use the framework's default 30-second total RPC invocation
deadline. Initial SSR signal delivery uses a progress deadline that renews as
results arrive, so long wave/interval settings can complete the initial document
but time out after Send, Resume, Refresh, Reset, or Retry. These settings expose
the transport deadline for investigation. The HTTP capture's default 30-second
consumer deadline is separate; raise it with `--timeout-ms=180000` when capturing
a long initial SSR workload.

## Evidence and measurements

**Export browser trace** downloads browser observations, navigation/resource
timings, and the matching producer trace. The inspector reports when it first
observes each ready region and logs activation and native/replayed input.
Observer installation may occur after an earlier DOM arrival; its log records
that installation time. These observations include instrumentation overhead and
are not paint, INP, or mobile-device measurements. Server and browser clocks
remain separate.

The local `/__lab/trace?run=…` endpoint reports bounded, run-relative producer
starts, yields, completion, errors, cancellation, and cleanup. Trace event sizes
are JSON/UTF-8 payload sizes, not protocol or transfer sizes. At most 64 runs and
4096 events per run are retained; a browser capture retains at most 2048 events.
The endpoint contains timing and size metadata. The downloadable browser
evidence and HTTP captures contain fixture HTML and the chosen configuration.

For serial HTTP measurements and retained raw samples, see
[Capture SSR streaming](README.capture.md):

```sh
pnpm --dir examples/signal-chat build
pnpm --dir examples/signal-chat preview
# In a second terminal, use a fresh absolute directory outside the repository:
node examples/signal-chat/scripts/capture.mjs --runs=3 --output=/tmp/signal-chat-capture
```

The capture records first response chunk, shell/ready HTML arrivals, complete
response duration, chunks, raw bytes, complete-response gzip/Brotli sizes,
producer terminals, and source/environment hashes. It archives a separate
warmup. Compare completed equivalent workloads, repeat samples, and inspect
variance before attributing an improvement. Timer delays are workload inputs;
producer tracing also performs JSON sizing on every yield. Neither path isolates
renderer CPU. A capture cannot prove the already-running server loaded the
recorded checkout, so rebuild and restart it before measuring changes.

The production Playwright journeys separately verify independent streaming,
initial first-value HTML, deferred catch-up without duplicate initial calls,
early composer focus/caret/value and node preservation, eager Unicode results,
fault recovery, superseded submissions, and cancellation cleanup. The journeys
also cover configuring equivalent deferred/eager workloads through the native
form and downloading evidence for each generated run. Diagnostics
are captured before navigation through the final interaction; warnings, console
errors, page errors, and hydration mismatches fail the journey.

The public-CLI capture tests retain split HTML/carrier checkpoints, prompt text
that resembles ready attributes, and rejection of incomplete or duplicate waves.

This example is intended to retain real bug reproductions. Add framework
regressions to the package that owns the behavior; keep this app's scenario as
integration evidence rather than hiding a defect behind application code.
