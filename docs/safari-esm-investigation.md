# Safari ESM investigation

## Scope and evidence

Research checked on 2026-09-12. This note identifies public WebKit issues worth
testing against Octane's **emitted production modules**. It does not establish a
Safari regression in Octane or explain changes in application usage. No production
telemetry or private application evidence is included.

Source imports, emitted files, native module-graph edges, repeated `import()`
calls, and transferred bytes are different quantities. Count them separately.
The candidates below have specific triggers; module count alone proves none of
them. Proposed experiments are not completed tests. Actual Octane measurements
belong in a separately identified section with source/build/browser identities.

## Candidate failures and discriminating checks

| Candidate | Necessary exposure to check | Public fix evidence | Initial priority |
| --- | --- | --- | --- |
| Concurrent imports observe a top-level-await module too early | Reachable top-level `await` and overlapping imports of that module/dependency | Loader rewrite landed; WebKit identifies Safari 27 beta / Technology Preview 251 as supporting the fix | High if emitted TLA exists; otherwise this explanation does not fit |
| A failed module preload poisons later imports | `modulepreload`, interrupted fetch, then reuse of the same URL | Safari 17 reproduction; bug still `NEW` when checked; no verified shipping fix | High for interrupted mobile-network recovery |
| Expensive namespace construction through star-export barrels | Many emitted `export *` edges and exported names | WebKit optimization landed April 2026; Safari 27 beta notes announce namespace performance improvements | Measure only if production retains this graph shape |
| Preloaded parser-inserted module rejected under CSP | `strict-dynamic`, module preload, and the same parser-inserted module without independent nonce/hash authorization | WebKit fix landed July 2026; first shipping Safari version not established here | Conditional on the actual response policy and script tags |

### 1. Concurrent dynamic imports and top-level await

WebKit bug 242740 documents imports exposing incomplete module initialization.
Its history records the loader rewrite landing as `311236@main`
(`4a638109b905`) on April 14, 2026. The original reproduction identifies WebKit
`16612.3.6.1.8`; this is not an exhaustive affected Safari/iOS version range.
[WebKit bug 242740](https://bugs.webkit.org/show_bug.cgi?id=242740).

WebKit's September 2026 explanation supplies a small discriminator: concurrently
import one module several times while its top-level `await` is unresolved, then
read its exported bindings. The old loader can resolve later import promises
before evaluation completes, causing initialization errors. The article assigns
the replacement loader to Safari 27 and offers Safari 27 beta or Technology
Preview 251 for testing. Do not assume a Safari 26.x installation has that fix.
[WebKit: Fixing Top-Level Await in Safari](https://webkit.org/blog/18227/fixing-top-level-await-in-safari/).

Proposed Octane check: AST-scan the reachable emitted graph for top-level awaits,
including dependency chunks, then run concurrent activation of two boundaries
sharing that graph. Record import completion, export readiness, and errors. Use
sequential activation and a semantically equivalent no-TLA fixture as controls.
`await` inside an ordinary async function is not the trigger. If the emitted
graph has no TLA, retain the synthetic browser probe as a compatibility check,
not an explanation of the application path.

### 2. Failed modulepreload remains cached

WebKit bug 270357 reports a Safari 17 module preload interrupted by network loss.
After connectivity returns, later dynamic imports fail without another network
request; an ordinary refresh does not recover the page. The report traces this
to a failed preloaded resource being reused by the resource cache. The public
issue remained `NEW` with no recorded fix when checked. That status does not prove
every current Safari build is affected.
[WebKit bug 270357](https://bugs.webkit.org/show_bug.cgi?id=270357).

Proposed check: on a disposable local origin, interrupt the body of one real
preloaded JavaScript response, restore transport, and activate the affected
boundary. Keep the same asset URL and browser session for the first retry and
ordinary-refresh checks. Record server requests as well as import errors; a
missing request distinguishes cache reuse from another network failure. Then
compare a fresh document/session and a non-preloaded control. A clean reload with
a newly generated URL is not evidence that same-URL recovery works. Do not
disable CSP or service-worker/security controls to manufacture success.

This candidate is a load/recovery failure, not inherently a CPU slowdown. More
critical chunk requests could increase exposure, but that is an application
hypothesis requiring measured failure rates.

### 3. Star-export namespace construction cost

WebKit commit `312370@main` (`66c577c4c2d0b9b3cc2d706ba9311240413a5e0b`,
April 30, 2026) changes namespace construction from repeated resolution through
the star-export graph to a single traversal with fallbacks. The old cost is
proportional to exported names multiplied by star-export edges. Its authors
report 331 to 19 ms for a local 9,000-name, approximately 1,500-edge microbenchmark;
those are **WebKit's measurements, not Octane or iPhone measurements**. The commit
explicitly says modules without `export *` do not benefit from this change.
[WebKit namespace optimization](https://github.com/WebKit/WebKit/commit/66c577c4c2d0b9b3cc2d706ba9311240413a5e0b).

Safari 27 beta release notes announce namespace-construction and export-resolution
performance fixes. The notes alone do not provide an affected-version matrix or
verify a 26.x backport of this exact commit.
[WebKit: Safari 27 beta](https://webkit.org/blog/17967/news-from-wwdc26-webkit-in-safari-27-beta/).

Proposed check: count star-export edges in production output, not package-source
barrels that the bundler may have removed. If they remain, compare equivalent
named-export and star-export graphs across increasing sizes with response bytes
and cache state controlled. A warm-fetch measurement helps separate loader CPU
from discovery/network cost. Record actual import-settlement time and input
responsiveness; do not extrapolate the source microbenchmark's speedup to Octane.

### 4. modulepreload and strict-dynamic CSP

WebKit commit `316290@main` (`d74bc8454ad40a5e567fd619b4f2cfff37b93df5`,
July 1, 2026; bug 317890) fixes a parser-inserted module script being rejected
after the same URL was module-preloaded under `strict-dynamic`. Its tests
separately cover ordinary script preload and mismatched URLs, which must not
receive the same treatment. The source fix is verified; a shipping Safari/iOS
version range is not established in this investigation.
[WebKit CSP/modulepreload fix and tests](https://github.com/WebKit/WebKit/commit/d74bc8454ad40a5e567fd619b4f2cfff37b93df5).

Proposed check: preserve the actual CSP, nonce/hash authorization, preload URL,
and module script tag in a local reduction. Capture `securitypolicyviolation`
and successful module evaluation. If the script is independently nonce-authorized
or the response does not use `strict-dynamic`, this particular failure is not a
good explanation. Repairing application authorization, if needed, is different
from weakening the policy; no policy change is proposed here.

## Existing Octane open-stream observation

The [implementation ledger](./async-signals-implementation.md) records a different,
historical local WebKit failure: even a dependency-free async module entry waited
for HTML EOF while a conversation subscription kept the document open. A classic
nonce-bearing script that launches `import()` executed before EOF under the
tested nonce-only CSP. That observation is not evidence of either the TLA race
or the star-export cost above, and it was not branded iOS Safari validation.

The streaming host implements that launcher in
[html-template.js](../packages/app-core/src/server/html-template.js), with explicit
failures for fetch attributes it cannot preserve. Separately,
[runtime.server.ts](../packages/octane/src/runtime.server.ts) emits inline early
signal/input capture. The later hydration entry's module closure must not be
charged as a dependency of that standalone capture script.

The discriminating retest holds HTML open after the launcher is delivered and
asserts actual module evaluation before EOF, followed by early-input adoption.
Comparing dependency-free and production entries separates document-readiness
behavior from graph loading cost. Keep current browser/build results separate
from the historical ledger and preserve the response's security policy.

## Current production fixture inspection

The September 12 conversation-streaming build contains 14 physical JavaScript
assets. TypeScript 5.9.3's JavaScript AST parser reported no parse diagnostics,
no top-level awaits (including `for await`), and no wildcard star re-exports.
Every inspected file's SHA-256 matched its recorded build manifest. The 14
dynamic import expressions are not 14 network requests or a graph-depth metric.
This output does not have the trigger for the TLA race or star-export namespace
cost described above. A different application's emitted graph may differ.

The standalone inline early input/interaction capture is 3,266 raw bytes,
1,290 gzip-9 bytes, or 1,100 Brotli-11 bytes. It installs listeners immediately
without waiting for module imports. The later hydration entry and its static
dependencies are separate work. The [performance note](./async-signals-performance.md)
records full sizing boundaries, source/toolchain identity, native desktop Safari
results, and retained local artifacts. Neither a graph inspection nor compressed
bytes measures load latency, main-thread responsiveness, or physical-device
behavior.

Native iOS 26.5 Safari testing subsequently observed one relevant recovery
failure: after a held parent-module request was aborted, another navigation on
the same origin failed parent hydration without requesting that asset again.
The identical build passed on a fresh origin. This is consistent with failed
resource reuse but does not establish the cache mechanism or an Octane defect.
The initial resource-error target and failed response headers/HTML were not
retained; a matching parent `modulepreload` tag is known from separate same-build
control HTML, not a capture of the failed navigation. The performance note keeps
this observation separate from four successful fresh-origin native iOS flows
and lists the remaining mobile/network evidence gaps.

## Ordinary loading cost is a separate hypothesis

`modulepreload` fetches a module into the document's module map and prepares it
for later execution. The HTML standard permits, but does not require, speculative
fetching of its dependencies. Therefore one root preload does not guarantee the
entire graph arrives in one parallel wave.
[HTML Standard: modulepreload](https://html.spec.whatwg.org/multipage/links.html#link-type-modulepreload).

Measure production discovery depth, critical-path requests, duplicated URLs,
failed imports, parse/evaluation time, and main-thread work before changing the
bundling strategy. Compare startup, first composer interaction, and deferred
conversation/history activation separately. Test cold navigation, warm reload,
same-document navigation, and interrupted fetch/retry as distinct cases.

A useful bounded experiment keeps source, payload, server behavior, and visible
output fixed while varying only the module boundary/preload strategy. Confirm
equivalent behavior before interpreting timing. Preserve repeated early input,
focus/selection, and no-refetch assertions: fewer imports are not an improvement
if they require eagerly activating every region or discard user input.

## Safari and iOS evidence boundaries

Record browser version, OS/build, hardware, cache state, and whether the run uses
desktop Safari, iOS Simulator, physical iPhone Safari, or a Playwright WebKit
build. None substitutes for the others. A current desktop pass cannot clear an
older iOS engine or establish physical-device responsiveness.

Use the Safari `Version/` token together with known device metadata when
stratifying observations. Safari on iOS/iPadOS 26 freezes the OS portion of its
user-agent string at the pre-26 value; inferring current iOS from that token can
misclassify versions. Use feature detection for conditional application behavior.
[WebKit: Safari 26 user-agent changes](https://webkit.org/blog/17333/webkit-features-in-safari-26-0/#update-to-ua-string).

Before attributing an application-level change, require the affected browser
cohort and time window, a matching emitted graph or failure signature, and an
equivalent control. This note supplies candidate mechanisms and tests, not that
causal evidence.
