# Capture SSR streaming

Build and start this checkout's Signal Chat server, then capture its loopback HTTP
responses from a second terminal:

```sh
node examples/signal-chat/scripts/capture.mjs --url=http://127.0.0.1:5237/ --runs=3 --output=/tmp/signal-chat-steady
node examples/signal-chat/scripts/capture.mjs --url='http://127.0.0.1:5237/?scenario=unicode' --runs=10 --output=/tmp/signal-chat-unicode
```

The output directory must be absolute, outside the repository, and not already
exist. The script performs one separately archived warmup by default. Use
`--warmup=0` for an explicitly unwarmed capture and `--timeout-ms=30000` for the
default finite deadline. Workloads using the maximum delays and wave count can
take longer; explicitly raise the deadline up to `--timeout-ms=180000` for them.
Run `--help` for all options.

Each request preserves the supplied URL's parameters and assigns a fresh `run`
ID. Raw HTML, chunk arrival times and byte counts, server producer traces, and
individual samples are retained. `summary.json` reports median/min/max for
recorded samples; `provenance.json` records Node/platform information, Git HEAD,
the relevant source manifest, and hashes of changed files. Capture fails if
relevant source files change while it runs. An existing capture is never
overwritten. Partial responses and failure details are retained when a request,
trace, or expected producer terminal fails.

The first shell/answer/history/tools checkpoint requires the region's public
ready attribute on a complete HTML start tag. Text, comments, ordinary scripts,
and quoted attribute values cannot imitate checkpoints. Resolved HTML can arrive
as a JSON string inside an `application/json` data script. That HTML is decoded
and inspected when its complete carrier arrives; each sample records whether the
checkpoint came from document HTML or a JSON HTML carrier. This observes delivery,
not display, hydration, or paint. Later signal values may stream without replacing
dormant HTML. The trace verifies exactly one start/terminal/finally lifecycle and
all expected ordered revisions for each document producer. It does not verify
yielded payloads, the result protocol, or final client-state correctness. Browser
tests provide that separate evidence.

Gzip level 9 and Brotli quality 11 sizes are offline compression of the **whole
response**, not streaming transfer measurements. Fetch requests identity
encoding; raw bytes exclude HTTP framing/headers and any decompression done by
Fetch. Local timings include the fixture's delays, HTTP and consumer overhead.
Run without concurrent builds or tests; three samples establish a smoke result,
not precise tail latency or a performance improvement.

For eager/deferred observation, capture `/eager` and `/` with identical scenario
parameters into separate fresh directories. Compare full completed responses and
producer traces before interpreting timing ranges. No speedup is inferred by
the script. Build/start the recorded checkout before capture: source hashes do
not prove what code an already-running server loaded.
