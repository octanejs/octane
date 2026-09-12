# Runtime array storage

This diagnostic covers the three array findings in [#981](https://github.com/octanejs/octane/issues/981): inline hook memo cells, the general keyed reconciler's collected keys, and lazy templates' namespace cache. It runs the actual bundled production runtime. It does not infer heap savings from source allocation counts or claim an application-wide speedup.

## Design and contract

- `hookMemoCreate` fills with `null`. Regular memo sites test their validity cell against `true` before reading dependencies or results. Generated invariant callback sites use a nullish check. Both forms preserve first computation, cached `null`/`undefined` results, delayed conditional sites, and callback identity. On Chromium 149, the previous all-`undefined` array used double storage, then changed to holey object storage at publication. `null` starts in object storage.
- The general keyed reconciler collects keys into `[]` using the same ascending indexed writes. Callback invocation order, raw key identity, errors, and subsequent key reads are unchanged. This removes holes caused by preallocation; an engine can still select a special representation for particular key values. Growing the temporary array can reserve more capacity than its length.
- Lazy template records start with `[null, null, null]`, one entry per HTML/SVG/MathML destination. This prevents an initial SVG or MathML parse from skipping array indexes. Parsing still happens on first use, and each destination has a separate cached node. The token now starts with three entries, including tokens that are never parsed.

These paths have no matching server-side array implementation. Existing namespace SSR/hydration coverage still exercises the shared compiler contract.

## Run

From the candidate checkout, build unminified, bundled ESM production runtimes from the baseline and candidate sources. The baseline used here was frozen from `fa11c1055` before implementation.

```sh
node_modules/.bin/esbuild /private/tmp/981-object-shapes-baseline/packages/octane/src/runtime.ts --bundle --format=esm --platform=browser --define:process.env.NODE_ENV='"production"' --outfile=/private/tmp/981-arrays-baseline-runtime.mjs
node_modules/.bin/esbuild packages/octane/src/runtime.ts --bundle --format=esm --platform=browser --define:process.env.NODE_ENV='"production"' --outfile=/private/tmp/981-arrays-candidate-runtime.mjs

node benchmarks/runtime-object-shapes/arrays.mjs /private/tmp/981-arrays-baseline-runtime.mjs /private/tmp/981-arrays-candidate-runtime.mjs --output /private/tmp/981-arrays-node-structural.json

node benchmarks/runtime-object-shapes/arrays.mjs /private/tmp/981-arrays-baseline-runtime.mjs /private/tmp/981-arrays-candidate-runtime.mjs --chromium /Users/domgan/Library/Caches/ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-mac-arm64/chrome-headless-shell --output /private/tmp/981-arrays-browser-structural.json

node benchmarks/runtime-object-shapes/arrays.mjs /private/tmp/981-arrays-baseline-runtime.mjs /private/tmp/981-arrays-candidate-runtime.mjs --chromium /Users/domgan/Library/Caches/ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-mac-arm64/chrome-headless-shell --timing --rounds 4 --output /private/tmp/981-arrays-browser-timing.json
```

Replace the browser path with an installed Chromium executable. The browser opens temporary local HTML files only. Node runs use the checkout's `jsdom`; browser runs use its actual DOM. To select another installed Node, invoke this script with that executable. No browser or dependency installation is performed.

Without `--timing`, a separate post-build instrumented bundle exposes the actual reconciler key array, while the script reads actual memo cells and template records. `%HasHoleyElements`, `%HasFastPackedElements`, `%HasDoubleElements`, and `%HasObjectElements` report V8 representation. Runtime records receive no added fields. The probe also verifies key values, DOM survivor identity, edited input values, and destination namespaces.

With `--timing`, the bundle is unchanged and V8 intrinsics are disabled. Each variant gets a fresh process/profile. Variant order alternates across rounds. Each workload has nine samples after warmup; reports retain every sample, engine version, and bundle SHA-256. Memo workloads create a cache and publish an object result, retaining a bounded ring of arrays. `--memo-only` skips template workloads for the alternative comparison below. These workloads measure constructor/publication or parser/clone cost, not isolated allocation cost or a whole render.

## Structural results

Observed on Node 24.19.0 / V8 13.6.233.17-node.51, Node 26.4.0 / V8 14.6.202.34-node.21, and Chromium 149.0.7827.55 on macOS arm64:

| Actual runtime array | Baseline | Candidate |
| --- | --- | --- |
| Memo cells, Node 24/26, before/after publication | Packed object elements | Packed object elements |
| Memo cells, Chromium 149, before publication | Holey double elements | Packed object elements |
| Memo cells, Chromium 149, after object publication | Holey object elements | Packed object elements |
| Template cache after MathML is parsed first, all measured engines | Length 3, one own entry, holey object elements | Length 3, three own entries, packed object elements |
| Template cache after SVG and HTML subsequently parse | Still holey object elements | Still packed object elements |
| Collected middle keys: string, number, object, mixed undefined, all measured engines | Holey elements | Packed elements |

The candidate retains numeric specialization for numeric keys. The mixed-undefined list starts with a non-undefined key; this table is not a guarantee for every possible key sequence. In Chromium 149, both `fill(undefined)` and repeated `push(undefined)` produced holey double arrays. Merely replacing the constructor with `push(undefined)` would not address that behavior.

V8's [elements-kind documentation](https://v8.dev/blog/elements-kinds) notes that `Array.prototype.fill` gained a repacking exception in February 2025. These conclusions are limited to the measured engines. The repository's minimum Node 22.22.2 uses [V8 12.4.254.21](https://raw.githubusercontent.com/nodejs/node/v22.22.2/deps/v8/include/v8-version.h); no Node 22 binary was installed for this run. An older V8 without fill repacking can retain holey classification for `new Array(size).fill(null)`. The candidate preserves the exact-size allocation and does not introduce engine detection.

## Four alternating Chromium timing rounds

Times below are milliseconds per 100,000 cache creations and first publications. Each cell is the median of four process medians; parentheses show their range. Lower is better.

| Cache cells | Baseline `fill(undefined)` | Candidate `fill(null)` | Change |
| --- | --- | --- | --- |
| 2 | 4.85 (4.70–5.00) | 2.30 (2.20–2.60) | −52.6% |
| 4 | 5.25 (5.10–5.50) | 2.90 (2.50–2.90) | −44.8% |
| 8 | 5.95 (5.80–6.10) | 3.15 (3.00–3.30) | −47.1% |
| 16 | 6.55 (6.50–6.90) | 3.40 (3.20–3.50) | −48.1% |
| 32 | 8.90 (8.10–9.40) | 4.40 (4.10–4.60) | −50.6% |
| 128 | 23.10 (22.80–23.20) | 11.50 (10.90–12.10) | −50.2% |

Template token creation was 0.80 ms per 100,000 in both variants. First clone/parse medians per 1,000 tokens were HTML 3.55→3.45 ms, SVG 3.90→3.95 ms, and MathML 3.60→3.70 ms. Cached clone medians per 10,000 clones were HTML 0.90→0.90 ms, SVG 1.80→1.80 ms, and MathML 0.90→0.95 ms. These small differences do not establish a template throughput improvement. The namespace change is supported by representation evidence and unchanged behavior.

Artifacts from this run:

- `/private/tmp/981-arrays-chromium149-timing-four.json`
- `/private/tmp/981-arrays-{node24,node26,chromium149}-structural.json`
- Baseline bundle SHA-256: `3cd287da1781216daa625c5e24b3a9189db6ff711717536a695905bc32d1a2b2`
- Candidate bundle SHA-256: `bee60812aa2da1e62b67258e48b3b0aebbb8005524d2e7366dbf3af4348c688f`

These hashes identify the frozen bundles used for these isolated array measurements, rather than assuming a later combined runtime build is byte-identical.

## Rejected alternative: repeated `push(null)`

The alternative changed only `hookMemoCreate` in a temporary copy of the actual candidate bundle. Its implementation was:

```js
function hookMemoCreate(size) {
  const cells = [];
  for (let i = 0; i < size; i++) cells.push(null);
  return cells;
}
```

For reproduction, replace the exact `hookMemoCreate` function in a temporary copy of the unminified candidate bundle, then run `arrays.mjs CANDIDATE.mjs PUSH.mjs --timing --memo-only --rounds 4`, adding `--chromium` for the browser comparison. The report's baseline is then `fill(null)` and candidate is `push(null)`.

Four alternating rounds showed faster small-cache construction, but extra capacity and slower large-cache construction:

| Cells | Chromium 149 time change | Node 24 time change | Node 24 backing capacity: fill → push |
| --- | --- | --- | --- |
| 2 | −52.3% | −62.6% | 2 → 17 |
| 4 | −51.0% | −60.7% | 4 → 17 |
| 8 | −50.9% | −56.3% | 8 → 17 |
| 16 | −40.9% | −49.0% | 16 → 17 |
| 32 | −4.9% | +23.3% | 32 → 43 |
| 128 | +35.3% | +35.6% | 128 → 140 |

Backing capacities came from a separate, untimed Node 24 `%DebugPrint` diagnostic of both initialization expressions. They are element capacities, not claimed retained-heap bytes. Memo caches live with their component, so the extra capacity matters beyond the constructor timing. The minimal `fill(null)` candidate was retained; no size threshold, extra branch, or runtime engine detection was added.

The exact alternative bundle SHA-256 was `ef101ad62dcba4872b7d219ea3f21ea12b0c988d51bf9cbe8775e622a283650a`. Results are in `/private/tmp/981-arrays-chromium149-fill-vs-push.json` and `/private/tmp/981-arrays-node24-fill-vs-push.json`.

## Behavioral verification

The focused development/production run passed 272 tests in six files, including new cases for nullish memo results and deferred conditional initialization, mixed raw-key reorders and full replacement preserving edited inputs, and a single ambiguous template mounted MathML→SVG→HTML twice. Existing namespace tests include SSR/hydration.

Each new contract was deliberately broken locally and failed in both projects: falsely valid initial memo cells caused a non-callable callback; omitted key collection caused incorrect DOM order; a namespace cache forced to index zero produced an HTML node in MathML. Each scoped mutation was restored, and all eight new test cases passed again. No representation or allocation-count assertions were added to correctness tests.
