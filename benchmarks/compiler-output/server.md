# Server compiler output

Issue [#981](https://github.com/octanejs/octane/issues/981), compiler-output SSR
entry. Baseline: `68d1ea120`, including the previously merged SSR snapshot work.

## Disposition

| Reported cost | Result |
| --- | --- |
| Attribute-hole IIFEs | The current compiler had one evaluation IIFE per dynamic host, rather than one per attribute. A sole ordinary attribute now evaluates directly in its first serializer. Multiple attributes, spreads, form/content channels, and attributes preceded by other dynamic serialization keep their frame. |
| Key IIFE for every list item | An explicit key evaluator is created once for each nonempty identity-bearing list. Its parameters, destructuring defaults, lexical captures, and evaluation before the body remain unchanged. |
| Render thunk for every list item | `ssrForItem` invokes the already compiled body directly inside the same keyed async identity. Indexed and unindexed bodies retain their exact argument counts; range wrapping and scope restoration remain inside the identity boundary. |
| `Array.from` for every `@for` | Retained. A list snapshots through its iterator before evaluating any item key or body. Skipping the snapshot for arrays changes custom iterators, accessor ordering, and render-time list mutation. Native `.map` lowering retains its existing separately guarded path. |

The attribute restriction is intentional: for `<div a={readA()} b={readB()}>`,
both reads precede either value's serialization. Directly inlining both reads
would let `a.toString()` run before `readB()`. Moving all attribute temporaries
into the enclosing component also extends their lifetime across later siblings;
the narrow change needs no new retained state, cleanup, or cache.

The existing escape-heavy SSR throughput audit measured the eager list snapshot
at approximately 0.025% of render time and 0.64% of sampled allocated bytes.
Those are prior measurements, not results rerun for this change; see
[the throughput methodology](../ssr-throughput/README.md). The new custom-iterator
control proves why removing that snapshot without an additional contract proof
would be incorrect.

## Deterministic work and size

`server.mjs` compiles a production 1,000-row keyed list. All rows execute a key
callback and a body callback, serialize a dynamic attribute, and escape their
text. Baseline and candidate return the same complete 35,807-byte response,
empty CSS, and row order. SHA-256:
`96ebe49f193b79816dc6cdbd25c5fd7fef77c9c071b7c8166ec22c36bdad2c11`.

| Metric | Baseline | Candidate |
| --- | ---: | ---: |
| Arrow expression sites inside the emitted item loop | 2 | 0 |
| IIFE sites in a sole-attribute host | 1 | 0 |
| Total emitted arrows in the list fixture | 4 | 2 |
| Emitted module, raw bytes | 908 | 906 |
| Emitted module, minified bytes | 494 | 485 |
| Emitted module, gzip bytes | 347 | 344 |
| Complete production bundle, minified bytes | 38,934 | 39,030 |
| Complete production bundle, gzip bytes | 13,870 | 13,906 |

These are emitted source sites, not measured V8 heap allocations. The list
executes each key and body 1,000 times; the two per-item arrow expressions move
from 2,000 reached source sites to zero. The key arrow remains once per nonempty
list, and the body declaration already existed. The standalone attribute
sentinel covers the IIFE removed from that row body as well. V8 may eliminate
some baseline allocations through inlining and escape analysis.

The fixed-argument runtime helper increases this small fully bundled fixture by
96 minified bytes / 36 gzip bytes. The ordinary attribute optimization has no
runtime helper or storage cost. This change does not claim an overall bundle
reduction.

## Timing and reproduction

Environment: macOS arm64, Node **24.20.0**, production esbuild bundles. Each
process warms for 350ms, then renders for two seconds; `Buffer.byteLength`
materializes every response inside the timer. Timed bundles have no allocation
instrumentation. Other local validation was active during measurement.

| Run | Baseline A1 | Candidate B1 | Candidate B2 | Baseline A2 |
| --- | ---: | ---: | ---: | ---: |
| Median ms/render | 0.299 | 0.313 | 0.358 | 0.531 |
| p95 ms/render | 0.378 | 0.465 | 0.553 | 0.792 |

The repeated baseline changed by 77%; timing is **inconclusive**. No throughput
or application-latency improvement is claimed. The reliable improvement is the
removed emitted per-item functions; the measured bundle cost remains explicit.

```sh
# Normal candidate, with deterministic work guards and standard ratio payload:
EXPECT_ITEM_ARROWS=0 EXPECT_SINGLE_IIFES=0 \
BENCH_JSON=/tmp/compiler-output-server.json \
node benchmarks/compiler-output/server.mjs 2

# Baseline: an immutable packages/octane source tree, with dependencies available:
OCTANE_SOURCE_ROOT=/path/to/baseline/packages/octane \
node benchmarks/compiler-output/server.mjs 2
```

`BENCH_JSON` emits the `compiler-output` suite with `ssr-reference` and
`ssr-compiled` targets. `itemArrows` and `singleIifes` are deterministic emitted
site counts. `EXPECTED_HTML_SHA` optionally enforces the exact baseline response.

## Correctness and self-review

`ssr-output-evaluation.test.ts` uses the shared public compiler fixture loader,
both development and production server output, and client hydration. It covers:

- once-only attribute evaluation and coercion order, nested/reentrant rendering,
  multiple attributes, spread getters, and final-writer semantics;
- custom array iteration followed by destructive mutation during the first row;
- exact indexed/unindexed body arguments, destructuring defaults and key order,
  and empty/null/undefined lists with no key or body evaluation;
- throwing item bodies, concurrent requests, and keyed reordering between
  Suspense passes;
- hydration adoption of the existing row hosts.

Before implementation, the initial 24 development/production executions passed
against the baseline behavior. Deliberately duplicating a sole attribute read
and dropping the index argument produced 12 failures at the intended order and
argument assertions. Both mutations were restored.

Self-review retained scope restoration and range wrapping inside `ssrForItem`,
kept key closure creation after the empty-list return, retained all multi-read
attribute frames, and avoided an additional temporary array in the compiler's
eligibility check. No input parser AST is mutated. No new runtime caches or
references survive the synchronous item invocation.

Broad validation also exposed source checks tied to the removed temporary and
callback spelling. The direct `use()` list check now verifies resolved values
after a retry reorders the list; the nested style check now verifies actual
client/server class lists and CSS in both compile modes. The unevaluable shared
style fixture retains its emitted-artifact check and admits direct serializer
arguments. These follow-up suites passed 412 executions across nine project
files. The attribute gate additionally requires that the serializer argument is
exactly the sole bound temporary before substituting its expression.

## CSS-module guard calibration

The existing CSS-module size sentinel compares proven constant classes with the
same source compiled without class proofs. Removing ordinary attribute IIFEs
improves its unproven control substantially. This reduces the denominator in the
proven/control ratio, even though both outputs become smaller.

The complete compiler source at baseline
`68d1ea1204901c7f5c71bcb99d4fdcec185ae13f` was loaded from an immutable archive.
Both revisions used the same current fixture bytes, absolute compiler filenames,
Node 24.20.0, esbuild 0.28.1, gzip level 9, and Brotli quality 11. The original
`measureCssModules` harness ran with only its compiler import and SSR runtime
resolution pointed at the selected source tree; measured JavaScript continued
to exclude the framework runtime in both revisions.

| Server CSS metric | Baseline control | Baseline proven | Candidate control | Candidate proven | Ratio before → after |
| --- | ---: | ---: | ---: | ---: | ---: |
| Raw bytes | 4,871 | 3,182 | 3,771 | 3,123 | 0.6533 → 0.8282 |
| Minified bytes | 2,535 | 1,943 | 2,199 | 1,919 | 0.7665 → 0.8727 |
| Gzip bytes | 971 | 884 | 936 | 888 | 0.9104 → 0.9487 |

Raw/minified control bytes fell by 1,100/336; proven bytes fell by 59/24.
Proven gzip increased by four bytes despite the raw/minified reductions. The
previous raw/minified ceilings of **0.75/0.84** therefore no longer describe the
cost difference between these two valid paths. They are recalibrated narrowly
to **0.84/0.89**, still requiring at least **16% raw and 11% minified savings**
from CSS proofs. The gzip and Brotli guards are unchanged.

The following SHA-256 values are equal across baseline and candidate:

- Fixture source: `edf7e7b1c713179dd3161a529c84ad9631b27cec969a633c26e39f77d2f07623`.
- Immutable provider: `60f42dc3df31a95d496403f028be1c00aacfa47f8e65aedf6db7d2e895abc2a8`.
- Complete SSR semantic results: `8dd3fa4a78efd4fe5aa16225f8f070df95f317527a4268d2f1feb4e1bd3ce93e`.
- Stylesheet: `4788c7b12a8120e1792ccaca2afc68b16a5bd1f1d095ec2f48feb2d99b370cf6` (703 bytes).

Two independent existing guards already fail at the frozen baseline and are
left unchanged: the fixed corpus gzip ratio is 30,050/26,442 = 1.1364 against a
1.06 ceiling (candidate 30,090/26,442 = 1.1380), and the CSS-module client
minified ratio is 2,326/2,726 = 0.8533 against a 0.84 ceiling on both revisions.
The client CSS sentinel is byte-identical in every measured format.
