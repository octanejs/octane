# Static document: website-mcp Landing

This is a benchmark-only whole-document experiment on the real `/` route in
`website-mcp`, not a general static-shell optimizer. The authored Landing has
literal data, scoped CSS and native links, with no child components, event
handlers, effects or signals. This experiment explicitly assumes that the
document will never need client remount, prop updates, mismatch recovery or
HMR. If those guarantees are absent, ordinary hydration remains necessary.

The benchmark copies the unchanged app and runs its real Vite build and Vercel
adapter. It invokes the emitted Vercel fetch wrapper locally. In a disposable
copy of that emitted server only, a guarded site after
`renderToReadableStream` and before `composeHtmlStream` removes the one Landing
modulepreload and the one external hydration script from the already prepared
template strings. The original renderer stream, inline scoped CSS, document
styles, non-executable route-data JSON and native links are passed through. It
does not buffer or rewrite the streamed body. The normal split is used if the
guard declines before the response is returned.

The fixture gate analyzes the authored Landing using the separate
[closed-world classifier](../static-document-analysis/README.md), and pins
the route/config, document template, generated server entry, all 132 emitted
server assets, emitted template and all emitted client JS files. The
classifier is narrow and requires successful client and server compilation;
its result alone does not establish the document's lifetime or the safety of
the emitted graph. Only the verified build ID and the generated hydration
filename are normalized for the fixed output comparisons.
It also checks the route, build ID, middleware/layout/boundary/nonce shape,
early-hydration state and exact tag counts at request time. For handler requests,
the local transport rechecks hashes of the emitted Vercel output and invokes a
separately copied, hash-verified original Vercel function when they differ.
Static assets are served before that check;
the transport does not restore corrupted assets. The drift control changes only
`config.json`, so it does not establish arbitrary asset-corruption recovery.
These are snapshot-specific checks, not a proof for
arbitrary plugins, dynamic components or asynchronous streams. The retained
JSON still contains route and streaming metadata; it is not executable JS.
Unexpected missing build artifacts or output layouts can stop this lab before
it has a usable ordinary build; universal fallback for arbitrary builds is not
established.

## Local result

One cache-disabled Chromium 149.0.7827.55 sample, Node v26.4.0, localhost. The
local transport gzip-compresses static assets and sends the document
uncompressed. Browser request sizes below are encoded response-body bytes;
response headers are listed separately. This is a byte and behavior comparison,
not a latency or deployment measurement.

| Initial load | Requests | JS requests | JS response bodies | All response bodies | Response headers |
| --- | ---: | ---: | ---: | ---: | ---: |
| Ordinary hydration | 10 | 8 | 91,578 B | 100,178 B | 2,167 B |
| Selected static document | 2 | 0 | 0 B | 8,466 B | 407 B |
| Forced guard fallback | 10 | 8 | 91,578 B | 100,208 B | 2,167 B |

The two requests for the selected document are its HTML and favicon. The
ordinary JS includes the 1,987 B Landing preload and 77,831 B shared runtime;
the remaining six files include the hydration entry and capture/seed support.
All **10 emitted JS files**, including files not requested in this sample,
remain available: 362,171 B raw and 114,344 B as the sum of separately
gzip-9-compressed files. This is an emitted-file upper bound, not a claim that
every file is reachable on this route. No fallback bundle is removed from the
build; a fallback request uses ordinary hydration.

The direct streamed HTML responses were 7,366 B ordinary and 7,232 B selected.
The selected request's query appears in the retained JSON, so these sizes are
not a pure tag-only difference. Both responses had zero executable inline JS.
The ordinary page retained one non-executable JSON script of 434 B and one
external module script; the selected page retained 453 B of JSON and no module
script. The sampled stream arrived in three chunks in both arms; no delayed
async frame exists in this component, and cancellation under an open stream
was not established by this run. Passing the original stream to the original
composer is a source-level observation; delayed frames, abort propagation and
backpressure are not tested here.

The verifier compared the complete SSR body after removing the two experimental
tags and per-request JSON, and separately checked the route JSON. Real Chromium
checks compared visible text, all three native link destinations, both inline
style blocks and a computed link color. A documentation link navigated to an
intercepted external destination in each arm; the selected route also passed
with JavaScript disabled. A forced request guard and a mutated configuration
artifact kept the ordinary bootstrap. Three separately built disposable source
variations also exercised selection: an added comment passed analysis and the
unchanged output pins, and the browser selected it with zero JS requests; a
heading event handler failed analysis, retained ordinary hydration, and its
browser click executed; a changed heading passed analysis but retained ordinary
hydration because both the normalized server and Landing client output missed
their fixed pins. The changed-heading case is an HTTP/build control, not a
browser parity test. `/v1/docs`,
`/v1/bindings`, `/llms.txt`, and a 404 returned
the same status and bytes with and without the experimental query. The run
recorded no browser/request errors or transport disconnects. It does not prove
behavior for client navigation, hydration mismatch, BFCache, HMR or a live
interactive descendant.

The emitted function is tested through a local Node HTTP bridge, not on Vercel
or a deployed site. Evidence covers GET requests only: the bridge does not
forward incoming POST bodies, and it does not establish MCP POST parity. The
temporary project links installed workspace packages,
including a host-specific native parser; a detached function's unrelated MCP
compile tool needs that native dependency and self-contained Vercel packaging
has not been established. The build uses this worktree's current sources,
including its existing local hydration fixes; it is not a deployed release
bundle. The report snapshots selected source trees, package metadata, the
lockfile and emitted artifacts, not every installed transitive build dependency.
No checked-in application source or deployment was changed.

## Reproduce and evidence

From the assigned Octane worktree, with the lockfile-matched local dependencies
already present:

`build.mjs` currently assumes the observed Darwin ARM64 pnpm store layout,
including its host-specific native parser link; this reproduction command is
not portable to an arbitrary platform or installation without adjustment.

```sh
node benchmarks/streamed-shell-prototype/static-document/build.mjs
PLAYWRIGHT_EXECUTABLE_PATH='/absolute/path/to/authorized/chromium' \
  node benchmarks/streamed-shell-prototype/static-document/verify.mjs <build-output-directory>
```

The verifier makes and retains the three source-variation builds, changes only
disposable copies, and will not overwrite an existing verification report. Run
the source-classifier mutation suite separately with:

```sh
node --test benchmarks/streamed-shell-prototype/static-document-analysis/analyze.test.mjs
```

The current suite passed all 64 tests. The
browser run required sandbox escalation on this host after the sandboxed
Chromium launch returned SIGABRT/EPERM. It does not install a browser.

The historical temporary evidence directory was named
`octane-static-document-Bd6RIb`; it is not published with this repository.
`build-report.json` SHA-256:
`9e9c73d3b5fbac194989b47150a8eda9ed47148a16d0840c8fd221dd3b4c63c9`;
`verification.json` SHA-256:
`5e75922ef683b9d18e74f0ca56355e75766645b631140c66d886323378d2c27d`.
The report records the authored inputs, all emitted artifact hashes, benchmark
and classifier script hashes, full per-request sizes and diagnostics. Its build
ID is `60388819-7728-4e35-aeae-a9d45b14e6f3`; original and patched server
SHA-256 values are `d444dd783b7d43c08e4263ea2e06171183108b3a5071cea9724f2fa528fda9c6`
and `f09f1ba20286f228d7ed0fde8e94845a7b944caef4e51b44c318dd66cf02a657`.
Temporary directories may be cleaned by the OS.
