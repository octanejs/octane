# Streamed shell validation

This is a behavioral experiment for the existing streamed shell benchmark. It
builds the benchmark's baseline and handwritten candidate with Vite, separately
bundles an SSR entry, and verifies that the two entries hydrate the same streamed
fixture. It does not implement or certify automatic shell extraction.

With the repository dependencies installed, run the browser harness:

```sh
node benchmarks/streamed-shell-prototype/stream-validation/run.mjs
```

On macOS it defaults to the installed Google Chrome. Set
`PLAYWRIGHT_EXECUTABLE_PATH` to a compatible, explicitly chosen Chromium
executable if the environment permits it. The harness starts a separate Node
server on loopback, serves the emitted ESM, and tests baseline and candidate
with the second signal frame arriving before and after activation. It checks
server/client loader calls, adoption and DOM identity, input value and focus,
button updates, cleanup and browser errors. It writes `browser.json` in the
fresh temporary build directory shown in its output.

Each combination runs three teardown cases. One ends the HTTP stream and
executes its terminal frame before unmounting and disposing hydration. Another
unmounts and calls `suspend()` while the stream is still open, then releases the
terminal frame. The third disposes before the terminal frame, checks the actual
pre-hydration mailbox was restored and receives that frame, and checks for
browser errors. The suspend case exercises the fenced ingress used by the
document lifecycle; it does not prove arbitrary reactivation. The early-dispose
case depends on the document's existing mailbox. Hosts without a prior renderer
still need suspension when late frame scripts can run.

A post-fix run with Chromium 149.0.7827.55 passed all 12 browser cases. The
four early-dispose cases restored the original mailbox and queued the late
terminal frame. The matching jsdom run passed all four cases. The historical
temporary evidence directory was named `octane-stream-browser-sQpNhE` and is
not published here,
with manifest SHA-256
`2caed4915479dc789152cba8e160f2405c92897865bff638982bc868f1c7def2`.

In the pre-fix runtime snapshot, the original browser run disposed hydration
before ending the HTTP stream. In Chromium 149, both baseline and candidate then
threw `TypeError: Cannot read
properties of undefined (reading 'receive')` when the parser executed the
terminal `complete` frame: disposal had removed the global receiver. A separate
probe observed no page errors when ending before disposal or suspending before
the stream ended. Its full
stacks, terminal frames and build manifest are retained in
[`early-dispose-observation.json`](./early-dispose-observation.json). This
observation predates the mailbox-restoration change and is retained as the
negative control. The original jsdom runner collected the last response write
after cleanup without executing it. The current runner manually executes that
write before disposal; this still does not emulate an incremental browser parser.

For a browser-independent integration check, build without launching Chrome and
pass the printed output directory to the jsdom runner:

```sh
node benchmarks/streamed-shell-prototype/stream-validation/run.mjs --build-only
node benchmarks/streamed-shell-prototype/stream-validation/node-jsdom.mjs --build-dir=/path/printed/above
```

This starts a separate SSR process and collects its HTTP response. A separate
metrics endpoint supplies the renderer writes to the test as they are produced;
the runner manually inserts those writes and executes their inline scripts in
isolated jsdom processes alongside the actual Vite-emitted ESM. At the end it
checks that the writes exactly reconstruct the HTTP response. Renderer scripts
and jsdom helper globals are bridged into the Node module realm. The side
channel is not an incremental HTTP parser and does **not** prove native browser
parsing, input behavior, network loading, or CSS. Results are written to
`jsdom.json` in the build directory.

Each build writes `manifest.json` with hashes of the selected fixture, surrogate,
modified hydration sources, entries, harness files, lockfile and emitted assets.
The verifier checks these before execution and records the manifest hash in its
result. This is not a hash of every compiler source or installed dependency.

The candidate is a handwritten, exact-DOM surrogate for one fixture, including
its compiler-generated child site. The test waits for the first streamed value
before activating; it does not exercise the pending fallback, remounts, changed
props, mismatches, arbitrary descendants, or application route bootstrap. No
performance conclusion follows from this behavioral check. See the adjacent
`RESULTS.md` for the narrower prior bundle measurements and their limitations.
