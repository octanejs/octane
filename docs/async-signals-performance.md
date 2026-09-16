# Async signals: performance evidence

This note separates three questions: what the browser downloads, what the server
does, and which behavior the measurements actually exercise. A smaller entry
chunk, a passing browser test, and faster application interaction are not
interchangeable results.

Each section identifies its measured source or historical checkpoint. Results from different checkpoints must not be treated as current bundle sizes or added together.

## Artifact-selected early adoption

Compiler-owned `adoptBindings` calls now use the adopter selected by their extracted view. Structural-only views no longer retain the fixed-layout adopter and node resolvers merely to dispatch to the structural program. Scalar views and combined mount/adopt artifacts retain the implementations they actually use. Identical local child plans also share an immutable descriptor; props, events, refs, subscriptions, and disposal remain per instance.

A matched dispatch-only comparison against `2675a0eca`, using Node 24.21.0, esbuild 0.28.1, production browser ESM and gzip level 9, measures these complete closures:

| Entry | Baseline raw / gzip bytes | Candidate raw / gzip bytes | Difference raw / gzip bytes |
| --- | ---: | ---: | ---: |
| Fixed-layout adoption | 11,693 / 4,427 | 11,706 / 4,437 | +13 / +10 |
| Structural adoption | 37,690 / 12,662 | 31,177 / 10,564 | −6,513 / −2,098 |
| Combined fixed-layout adoption and mounting | 34,764 / 11,676 | 34,767 / 11,677 | +3 / +1 |
| Ordinary `createRoot` | 198,171 / 63,207 | 198,171 / 63,207 | 0 / 0 |

The ordinary entry is byte- and hash-identical. All adoption entries exclude the renderer and signal graph. These overlapping closures are not additive application-route savings, and this does not establish a startup-budget pass or a CPU speedup. Child-plan sharing is a separate compiler-output reduction; repeated output already compresses well, so its raw-code reduction must not be presented as an equivalent gzip saving.

The existing behavior suite covers scalar adoption, structural updates, combined mount/adopt fallback, nested calls, argument evaluation order, independent child instances, and cleanup. Deliberately restoring the old dispatch discriminator fails scalar adoption; using only the child declaration instead of its exact specialized plan fails event behavior. The bundle-boundary benchmark compares a real compiled public adoption entry with the selected-artifact control, with matching SSR/update/disposal semantics.

## Optional keyed-list capability

Newly compiled renderer-free programs select keyed-list support only when an authored branch, child, or caller-owned slot can use it. Selection covers inactive branches, not just the initial output. Older descriptors keep the full list implementation through their existing entry points; mixed-generation descriptors are supported when they resolve against the updated runtime. This does not establish compatibility between separately bundled runtime versions or expand structural hydration handoff to lists.

A matched comparison against `c1f60f058`, with unchanged fixtures and dependencies on Node 24.21.0, measures complete browser ESM closures with gzip level 9:

| Bundler / entry | Baseline raw / gzip bytes | Candidate raw / gzip bytes | Difference raw / gzip bytes |
| --- | ---: | ---: | ---: |
| esbuild 0.28.1 / list-free adoption and mounting | 33,797 / 11,485 | 32,345 / 11,057 | −1,452 / −428 |
| esbuild / list-enabled adoption and mounting | 30,805 / 10,573 | 31,103 / 10,667 | +298 / +94 |
| Vite 8.1.5 / list-free adoption and mounting | 44,557 / 12,576 | 42,656 / 12,111 | −1,901 / −465 |
| Vite / list-enabled adoption and mounting | 40,623 / 11,660 | 40,930 / 11,772 | +307 / +112 |

Vite uses Rolldown 1.1.5. The ordinary `createRoot` control is byte- and hash-identical for both bundlers. All binding closures remain renderer- and signal-graph-free. These are overlapping source-entry measurements, not additive route savings or an application budget pass.

The tradeoff is a capability reference on each root transaction and list-bearing artifact, plus an indirect call for each list adoption, preparation, and commit. There is no new per-item allocation, subscription, or plan scan. No CPU or latency improvement is claimed. Common range movement stays available to list-free mounting and branches.

The existing behavior scenario and Node bundle-boundary benchmark preserve SSR node and keyed survivor identity, caller slots, inactive-to-active lists, empty/repopulated lists, native edits, commands, duplicate-key failure, abort, and disposal. The benchmark includes legacy entry controls; forcing legacy retention breaks its size ratio, and removing legacy-child capability forwarding breaks the inactive-list behavior. A separate actual `c1f60f058`-compiled artifact passes SSR adoption and mounting against the new runtime. Self-review removed a duplicate `ownerDocument` read by passing the existing preparation-time value to the list helper.

## Shared compiled StyleX recipes

Production client builds can share closed, immutable compiled StyleX recipes between the normal component and its extracted binding artifact. The compiler supplies proof of eligible authored uses; the StyleX adapter extracts the resulting class-name and inline-style objects after compilation. It preserves local folding and CSS/reset behavior. Development/HMR, server output, mutable or escaping recipes, and unproven dependencies remain unchanged. This is compile-time sharing, not a new runtime style owner.

The permanent Node bundle-boundary benchmark uses 48 static and 12 dynamic recipes, the real Octane and StyleX transforms, and esbuild production splitting with gzip level 9. Sharing is disabled or enabled with the same candidate sources and dependencies; every emitted shared chunk is included:

| Complete delivery | Sharing disabled, gzip bytes | Sharing enabled, gzip bytes | Difference |
| --- | ---: | ---: | ---: |
| Both entries and all shared chunks | 84,506 | 82,631 | −1,875 |
| Standalone early entry | 14,166 | 14,344 | +178 |
| Early import closure within the paired build | 17,085 | 17,054 | −31 |

Sharing the complete recipe can increase a standalone early entry because the normal component needs fields that early-only compilation could prune. Savings across two entries are therefore not an equivalent startup saving. Neither these fixture sizes nor the optional-list measurements above establish a consuming application's budget pass. No CPU or interaction-latency improvement is claimed.

The benchmark compares normal and renderer-free DOM behavior with sharing off and on, including numeric, zero, string and null widths, variants, reset styles, text, disabled state, node identity and cleanup. CSS is identical and the early closure excludes the renderer and signal graph. Disabling the extraction helper deliberately fails the sharing guard. Existing conformance tests cover cached Babel-plugin reuse, mutation and escape refusal, local folding, virtual-module emission, and original-source maps; compiler frozen-AST checks pass.

A production fixture also passes SSR adoption and computed-style parity in bundled Chromium 149 and Playwright WebKit 26.5, preserving the server node through updates and releasing its subscription once. The fixture's server and client use the same canonical compiler module ID. This is local browser evidence, not physical iOS Safari or application qualification. Eight ordinary client/server development/HMR controls retain byte-identical output and source maps against `c1f60f058`.

## Narrow CSS helper module boundary

Whole-style bindings now import CSS value and property-name helpers from a narrow canonical module. Existing DOM-table imports re-export those same functions and share the same unitless-property cache. The implementations are unchanged. This keeps renderer-only attribute and namespace tables out of the early style chunk when a later renderer entry also uses the broader table module.

The permanent bundle-boundary benchmark builds the early style capability alongside `createRoot`, `createElement`, and `flushSync`, using Node 24.21.0, esbuild 0.28.1, production browser ESM splitting, target `es2022`, and gzip level 9. Its control restores only the broad import edge, with identical helper implementations and dependencies:

| Complete delivery | Broad import, gzip bytes | Narrow import, gzip bytes | Difference |
| --- | ---: | ---: | ---: |
| Early entry and its shared imports | 4,602 | 2,970 | −1,632 |
| Both entries and all shared chunks | 62,154 | 62,233 | +79 |

This moves unrelated table delivery out of the early path; it does not remove those tables from the later renderer or shrink the complete program. A separate frozen comparison against `8f230e95b` records standalone renderer gzip changing by +17 bytes with identical raw length, and standalone styles by +1 byte. These controls confirm that the benefit concerns split-entry delivery rather than standalone tree shaking. Application chunk grouping and route budgets require their own measurement; no browser latency improvement is claimed.

Both benchmark variants execute the emitted early and renderer modules, comparing numeric and zero units, unitless and vendor properties, custom-property casing, resets, and child preservation. A deliberate broad-import fault passes those semantic controls and then fails the early dependency guard. Existing development/production CSS, static-bake, and server serialization cases remain unchanged.

## Optional advanced host operations

Renderer-free structural programs now select control, grouped-projection, grouped-class, and native-initialization orchestration only when a compiled fragment can use it. Selection includes inactive branches, local and imported children, and caller-owned slots. Ordinary class, style, text, attribute and event bindings remain available without this capability. Both older program entry-point families retain their prior behavior against the updated runtime; this is not a claim about mixing separately bundled runtime versions.

A frozen comparison against `8f230e95b`, applying only this three-file capability change with the same dependencies and authored inputs, measures complete minified browser ESM closures on Node 24.21.0 with gzip level 9:

| Bundler / entry | Baseline gzip bytes | Candidate gzip bytes | Difference |
| --- | ---: | ---: | ---: |
| esbuild 0.28.1 / simple structural bindings | 12,504 | 11,640 | −864 |
| esbuild / control-bearing bindings | 12,680 | 12,860 | +180 |
| Vite 8.1.5 / simple structural bindings | 13,775 | 12,819 | −956 |
| Vite / control-bearing bindings | 13,889 | 14,089 | +200 |

The ordinary `createRoot` control is byte-identical in both bundlers. Older selected artifacts retain the conservative capability and grow by 241 gzip bytes with esbuild and 256 with Vite. These measurements are not additive to other fixture savings and do not establish an application budget pass. The tradeoff is one optional transaction reference and indirect lifecycle calls where the capability is used. Simple programs avoid the grouped-class preparation scan; no per-node scan or per-instance helper allocation is added. CPU and browser latency remain unmeasured.

The permanent Node bundle guard compares the same current descriptor with and without its previous selected entry points: 11,612 versus 12,732 gzip bytes for the simple case. Its imported host-bearing semantic control is 16,722 versus 16,806 bytes. Development/production, mount/adoption, initially hidden/visible branches, repeated controls, initial select values, preserved external classes, grouped styles, events and abort/disposal pass. A separate 64-case matrix uses actual `8f230e95b` compiler artifacts, including both imported-child and caller-slot ownership. Forcing the conservative implementation fails the size ratio; deleting older-child capability forwarding fails control activation. The existing behavior and compiler/AST suites remain unchanged.

## Independent reads in static native output

The compiler can start same-module immutable query/derived reads together in complete static native JSX output with homogeneous text/renderable holes. Public client and SSR regressions start both eligible loaders in one round instead of waiting for the first to settle. Declarations and unentered branches stay lazy; original reads retain errors and suspension. Components, resource-loading/custom hosts, dynamic attributes and opaque values remain ordering barriers. Review added resource-host exclusions and a case-insensitive attribute barrier after a customized built-in constructor probe exposed changed execution order.

A frozen comparison against `1dd77e178` isolates this compiler pass and its shared signal helper from other runtime changes. Node 24.21.0 and esbuild 0.28.1 produce minified ESM with gzip level 9. The classifier SHA-256 is `4e4b795c84908c30a3cf8c11d303d10d3a35a1e1387398bfbc474cbf3d684282`, the facade is `992e5db0938b6f5a13ebf2f180ea4d74b2a6235930235587be6bcabb25a76fcf`, and the compiler is `67add7d6d5f73185b5f69cc5a72c70a5b22b9151c8fd0738e82ac35b31d86c14`. Ordinary and declaration-only controls are byte-identical. Adjacent-local-read compiler output is unchanged; its shared helper adds 95 raw / 37 client gzip bytes and 95 / 36 server bytes. The two-hole JSX fixture adds 106 emitted bytes in each mode; its complete closure adds 197 raw / 84 client gzip bytes and 194 / 67 server bytes. Cached eligible renders pay for one array and helper traversal; no IIFE is introduced.

The focused compiler, frozen-AST, parallel-read and neighboring async suites pass 144 cases across their development, production and Strong-mode projects, including hydration and cancellation. Start-order evidence does not establish a browser, route, CPU or latency speedup. The full codegen-size benchmark was attempted before this change and failed its existing rspack CSS-module assertion (`main.cjs` versus `main.cjs` plus `679.main.cjs`); the isolated measurements are not a passing full-benchmark claim.

## First-client undefined attributes during hydration

The first client `undefined` for an explicitly owned attribute must remove the SSR value, not compare equal to an uninitialized client cache. The fix reuses existing hydration-aware setters for direct attributes and native prop spreads. It preserves native node identity, unrelated server attributes, refs, controlled-input adoption, and the absent-handler event fast path. No per-node state, extra prop enumeration, or getter evaluation is added.

A runtime-only frozen comparison with `1fe1134a4` uses Node 24.21.0, esbuild 0.28.1, minified browser ESM and gzip level 9. The measured runtime SHA-256 is `e181dc796253e6be6cd8381ec061f6820c6f814dd4423e4d50d7c24c69fe1875`. The ordinary component adds 53 raw / 17 gzip bytes, the simple eligible component adds 53 / 15, and the closed-rest framework companion adds 142 / 42. Scalar, structural and ineligible early descriptors plus the `createRoot` and `hydrateRoot` export closures remain byte- and hash-identical. All eight ordinary/scalar client/server emitted controls are identical. These are overlapping closures, not additive route costs; no runtime speedup is claimed.

The scoped hydration, signal, spread, ref, and staged-write suites pass 390 development/production cases. The existing hydration regression fails before the fix; a separate fault reproduces needless registration for an undefined event handler. Two independent reviews and their final hydration-file reruns pass. A consuming-source JSDOM probe confirms that a restored draft enables the same SSR button and removes stale accessibility and visual-disabled attributes while early-to-normal signal takeover still passes. This does not qualify a served application, browser/device behavior, or the separate direct `formAction` compiler-cache path.

## Structural hydration handoff and closed caller props

The structural-handoff candidate was compared with `7a83b5a89` using captured source snapshots and the same installed dependencies: Node 24.21.0, esbuild 0.28.1, browser ESM targeting `esnext`, production minification, and gzip level 9. The measured runtime SHA-256 is `fd8de1bcb84dbfff96edcb4d3374c50637f08449f42e1039507a7202b1b45a33`; the compiler SHA-256 is `a620c9245d9123cf2f03621f5f4c77c66610c2e8a6cfaa787685c841676d6faf`. No framework or fixture source changed during measurement.

| Complete source-entry closure | Baseline raw / gzip bytes | Candidate raw / gzip bytes | Difference raw / gzip bytes |
| --- | ---: | ---: | ---: |
| Ordinary compiled component | 209,812 / 66,120 | 212,439 / 67,049 | +2,627 / +929 |
| Scalar early-binding descriptor | 1,272 / 677 | 1,272 / 677 | 0 / 0 |
| Structural early-binding descriptor | 30,554 / 10,437 | 33,719 / 11,423 | +3,165 / +986 |
| Ineligible-list descriptor | 31,855 / 10,771 | 32,120 / 10,866 | +265 / +95 |
| `createRoot` export | 195,845 / 62,379 | 198,171 / 63,207 | +2,326 / +828 |
| `hydrateRoot` export | 246,422 / 78,081 | 249,678 / 79,215 | +3,256 / +1,134 |
| Eligible normal-renderer component | 210,259 / 66,263 | 237,823 / 75,439 | +27,564 / +9,176 |

These are overlapping framework closures, not additive chunks or an application-route budget. The eligible normal-renderer entry now retains the selected presentation-adoption and native-read support; it is distinct from the early descriptor. None of the three descriptor bundles retains the renderer, server, or signal engine/graph/facade. Ordinary component and root exports do not retain the optional native-read collector.

Eight ordinary/scalar compiler controls, covering client/server and development/production, remain byte-identical. The scalar bundle is also byte-identical. Structural descriptor output adds 288 raw / 44 gzip bytes before bundling; the remaining increase is shared program support. The ineligible-list compiler output is unchanged. The eligible normal-renderer output adds 2,146 raw / 295 gzip bytes before bundling. No runtime timing or speedup is inferred from these byte measurements.

The public behavior suite passes 98 development/production cases, including suspended and staged attempts, stale-read rejection, bare child-component roots, exact caller shapes, ref ownership, authored-error reporting, and unsupported-region refusal. Separate consumer-source JSDOM checks preserve native button/SVG identity, live signals, single-delivery commands, and owner cleanup through early-to-normal takeover. These are not served-application, browser, or physical iOS Safari qualification. The narrower fixed-view browser evidence below does not qualify the new structural path.

### Compiler-selected host-writer follow-up

An isolated follow-up against `1dd77e178` separates generic host-spread preparation from the ordinary presentation-writer dispatcher. Using the same frozen fixtures and toolchain, the simple eligible normal-renderer entry falls from 237,823 raw / 75,439 gzip bytes to 229,341 / 72,875, a reduction of 8,482 / 2,564 bytes. Its compiler output is unchanged: the saving comes from dropping unused host-spread, form, and raw-HTML machinery. A separate closed-rest framework fixture still retains those capabilities and changes from 233,177 / 74,231 to 233,141 / 74,217. This companion is not the consuming application's button.

All six ordinary/early/root bundle controls and all eight ordinary/scalar emitted controls remain byte- and hash-identical to `1dd77e178`. The measured runtime SHA-256 is `e9ee253f071442643b2043f3b5380e217aecfa87ad26afecc27b5a6c982ba745`; the isolated compiler SHA-256 is `cca852dcacb024cb51c02c9904adc80ab2845ebb45b127939f3e020e616a1a8c`. Concurrent query-start work was excluded. Existing public behavior and production-bundle tests pass 107 cases, with the bundle regression failing before the split and passing afterward; 120 compiler/AST checks also pass. This does not change early-entry delivery or establish an application-route saving or runtime speedup.

## Optional early-binding hydration handoff

The fixed-view handoff candidate, including its catalogued runtime diagnostics and staged-cleanup repairs, was compared with `1cfbc9e78` using the same installed toolchain. Its measured runtime SHA-256 is `dce2729e189cc54d20c5c7be0d180f5bbddb806347eda69eb4beaad46d6816ab` and compiler SHA-256 is `260af6e9c8dc310457d650530085e65f94ed71da311feccf2127efc4072a3206`; loaded source hashes stayed unchanged during measurement. The source-entry runner used esbuild 0.28.1, Alien Signals 3.2.0, and devalue 5.8.2. The rich authored fixture used production Vite 8.1.5 / Rolldown 1.1.5 on Node 24.21.0, Darwin arm64.

| Measured delivery | Baseline gzip bytes | Candidate gzip bytes | Difference |
| --- | ---: | ---: | ---: |
| Ordinary client source-entry closure | 58,419 | 58,698 | +279 |
| Ordinary server source-entry closure | 17,654 | 17,654 | 0 |
| Scalar binding source-entry closure | 3,907 | 3,910 | +3 |
| Complete rich authored behavior entry | 35,575 | 35,949 | +374 |
| Rich fixture inline capture, including script tag | 457 | 457 | 0 |
| Rich fixture later map interaction chunk | 92 | 92 | 0 |

The program-binding source-entry closure adds 248 gzip bytes. These overlapping closures must not be added together. Source-entry measurements exclude consuming-application compilation and are not an application startup budget. The rich fixture's complete entry includes its signal engine, stream support, view, and driver, but still excludes the renderer and React. The handoff adds shared event-receipt and ownership machinery even when this fixture never loads the renderer; that cost is not zero.

The ordinary native-read scheduling path checks a pending-activation count before walking ancestors. It walks only while some preserved hydration activation exists, retaining the pending boundary's publication ownership instead of committing a descendant independently. The count is released on completion, error, and teardown. This removes an unconditional ancestor walk; no CPU, allocation, or application-latency speedup is claimed.

The final fixed-button browser fixture passes development and production in bundled Chromium 149 and Playwright WebKit 26.5. A synchronous Stop-to-Send update works before renderer loading and on three subsequent clicks while hydration is suspended. Commands run once, early cleanup stays at zero until acceptance, current attributes and styles precede refs, and the same button, focused input, draft, and selection survive. A separate 32-case browser matrix covers capture/bubble listeners, stopped propagation, trusted synchronous takeover, and immediate redispatch of the same scripted Event. Cleanup happens once and later commands remain live. These are local fixture checks, not CI, application integration, physical iOS Safari, or input-latency qualification.

Reproduce the byte controls with `benchmarks/scoped-signals/run-bundles.mjs` against an immutable `1cfbc9e78` package and `benchmarks/conversation-streaming/behavior-only/build.mjs --bundler=vite --rich-presentation=authored` for both revisions. Existing behavior-root and hydration tests retain pending, canceled, accepted, replaced-root, historical-adoption, and cleanup coverage. The [handoff contract](./deferred-hydration.md#optional-handoff-to-normal-hydration) remains intentionally limited to supported fixed native views; structural regions, dynamic text, and writable-control handoff are not qualified by these checks.

The staged-replacement regression keeps early commands active until native DOM publication, retires the displaced lease once, and rejects a superseded transition's stale callback. A ref prepared by a hydration attempt that never commits receives neither a node nor a cleanup callback. Fresh array/object class values are covered on HTML and SVG hosts in both compiler modes.

## Style-object spread follow-up

The compiler-only `knownAttributeSpreads` style-object opt-in was compared with its parent `45d45ebd5` using the same installed toolchain and `behavior-only/build.mjs --bundler=vite --rich-presentation=authored`. The existing rich entry, map interaction chunk, and inline capture remain byte-identical: their SHA-256 values are respectively `ddb4b0dda959d106c91f8087717bc3915d99038448207fcf04ecc12a21736aed`, `16e4f0a2b53604f699d80a9e0c4bb2cd5357bf8f9862e1139f1a99ba6c106045`, and `9170ed8229ac673a79ef56a574d76424f5da23c9aabbfc4f4ce703dd8e872f93`. This is a feature-off regression control, not a claim that selecting whole-style support is free.

A separate local production probe runs the real StyleX 0.19.0 transform after Octane compilation. It compares the shorthand props spread with explicit class/style fields for the same non-null scale signal. Complete fixture closures are 23,532 versus 23,523 gzip bytes, including the signal engine, bindings, StyleX, and test driver; the 9-byte difference is not an application budget measurement. Both graphs exclude the renderer. Chromium 149 and Playwright WebKit 26.5 pass SSR catch-up, signal updates, source replacement, node identity, and disposal checks. Seven batches of 1,000 updates each perform zero parent snapshot evaluations in both forms. Timings are too small and narrowly instrumented to establish a speedup; they exclude paint and input latency. WebKit is not physical iOS Safari qualification.

This first follow-up does not implement automatic dynamic-function type lifting, numeric-unit conversion on handles, nullable class selection, or fixed-variable lowering. The existing whole-style capability still reads and diffs its object on notifications. Those follow-ups must be measured against the same semantic workload, including the explicit shared-derivation control.

## Parallel-start and demand-ownership candidate

Matched minified esbuild closures compare upstream `733c98d57` with the parallel-start candidate based on `4cd85fbcb` plus the resolved upstream merge, lightweight retry-ancestry repair, and exact-owner control retirement. The measured renderer SHA-256 is `fb5e438ee14d78fe26c585b37d766da8c06d5c625ec262b24fc7aa88ff76dbc4`; the control implementation is `97c33f57a4ebafd35006125e7f11718b8e663acd5b0290d100481443304a019f`. No loaded source changed during measurement. Both use the same installed toolchain and production flags.

| Complete dependency closure | Upstream gzip bytes | Candidate gzip bytes |
| --- | ---: | ---: |
| Ordinary `createRoot` | 53,285 | 58,405 |
| Ordinary `renderToString` | 14,906 | 17,654 |
| Scalar authored bindings | Export unavailable | 3,653 |
| Structural authored bindings | Export unavailable | 8,286 |
| Optional control capability | Not measured | 3,221 |
| Optional whole-style capability | Not measured | 2,216 |
| Scalar bindings with controls and whole styles | Not measured | 7,941 |
| Scoped signal engine | Not measured | 9,543 |
| Native client signals | Not measured | 10,933 |
| Native server signals | Not measured | 10,845 |
| Compiled plain-module signals | Not measured | 15,155 |
| Full streamed-signals bootstrap | Not measured | 18,545 |
| Results-only bootstrap | Not measured | 16,561 |

The ordinary client adds 5,120 gzip bytes and the ordinary server adds 2,748 versus upstream. These measure the entire RFC branch, not just the latest fix. Neither ordinary entry retains the optional scoped graph. Scalar and structural binding entries exclude the optional control/style capabilities and retain their published `f3eccc2fc` sizes. The fifteen available baseline/candidate closures pass boundary and export-load checks; two baseline binding exports are unavailable. Complete closures overlap: they cannot be added together or read as an application's startup increment. The runner labels these source-qualified bundle measurements preliminary, not application-budget acceptance.

The matched Chromium mount gate records 34,090 compiled calls versus upstream's 34,088, below the existing 35,000 limit; the previously published branch recorded 50,112. All twelve effect-cleanup gates pass, with compiled counts equal to upstream and JSX counts one call higher. These are work counts, not wall-clock speedups.

The final rich streaming fixture emits 35,086 gzip bytes for its renderer-free authored entry versus 100,459 for the renderer-backed entry. Both deliver an additional 457 gzip bytes of inline capture and load a 92-byte interaction chunk only upon map activation. These complete fixture entries include their signal/query engine, transport, view, and driver; they are not isolated framework overhead. Chromium and Playwright WebKit produce matching assets and pass 24 measured flows plus eight warmups, including page teardown. Neither those passes nor the byte difference establishes application startup cost, paint, input latency, or physical-device performance.

The no-signal 800-card diagnostic retains complete output while eliminating 1,601 speculative signal owners and 3,200 serialized signal-identity paths. Existing structural frame metadata still exists. Matched SSR timing and browser qualification are separate from this allocation diagnostic.

### Matched SSR timing

Four fresh production-build processes ran published `f3eccc2fc` and the candidate in A–B–B–A order, with five warmups and thirty timed renders per scenario. All six output gates passed in each process. Node 24.21.0 on Darwin arm64, TSRX core/runtime 0.2.0, OXC 0.13.0, Vite 8.1.5, esbuild 0.28.1, fixture inputs, and the dependency lock were held constant. Each variant's emitted entry hash remained identical between its two runs.

| Stream completion | Published score range, ms | Candidate score range, ms |
| --- | ---: | ---: |
| 10 cards | 0.160–0.299 | 0.177–0.297 |
| 100 cards | 1.342–1.438 | 1.275–1.421 |
| 800 cards | 9.763–10.216 | 9.518–10.135 |
| 50 cards in reverse waves | 1.910–1.912 | 1.870–1.915 |

These are ranges of two process scores, not confidence intervals. The 800-card score's reported relative uncertainty is approximately 1.8–2.8%; the smaller cases have substantially more noise. The ranges overlap, so this comparison establishes neither a speedup nor a regression. A separate same-configuration upstream `733c98d57` control records 10.213 ms for 800 cards and 1.865 ms for reverse waves; one control process is not a paired upstream performance claim. All thirty-iteration 800-card variants emit 1,433,920 bytes in two chunks. Shorter runs emit smaller request tokens; the separate allocation diagnostic's smaller byte count is not missing card output.

A fresh six-scenario correctness smoke after the control-retirement repair produces the same server entry SHA-256 (`29bc9b3ae7cae643b4b071ff91bb314340136b0c6bcc0e91daa3e1729de6acde`) as both timed candidate processes. The browser-side repair therefore does not change this measured executable. The smoke's three-iteration timings are not compared with the thirty-iteration measurements.

## Historical renderer-free binding comparison (`61e51dd8b`)

The [behavior-only benchmark](../benchmarks/conversation-streaming/behavior-only/README.md)
compares the same fixed native button, icon spans, SVG, state source, events,
streamed results, and cleanup. The manual variant updates properties through a
handwritten callback; the authored variant uses the compiler-generated
`adoptBindings` projector.

Both use Vite 8.1.5 / Rolldown 1.1.5, Node 24.21.0, and source-built TSRX core
0.1.71/runtime 0.1.7. External JavaScript sizes compress each physical file once.
Inline capture is separate; its row includes the fixture's script tag.

| Delivery | Manual | Authored | Difference |
| --- | ---: | ---: | ---: |
| Initial JavaScript, raw bytes | 65,563 | 68,947 | +3,384 |
| Initial JavaScript, gzip-9 bytes | 19,983 | 21,165 | +1,182 |
| Initial JavaScript, Brotli-11 bytes | 18,077 | 19,079 | +1,002 |
| Later optional JavaScript, gzip-9 bytes | 4,090 | 4,090 | 0 |
| Inline capture, raw bytes | 811 | 811 | 0 |
| Inline capture, gzip-9 bytes | 457 | 457 | 0 |

**The authored binding is not a bundle-size win for one small view.** Its reusable
validation, subscription, and cleanup machinery costs more than this small manual
callback. The earlier unused-adoption control was byte-identical to its own
baseline, so this is an opt-in cost for that workload.

No renderer module resolves in either browser graph, including modules that a
bundler might otherwise tree-shake away. The optional query implementation stays
outside initial delivery. Neither statement means the live signal/receiver
support is free.

The final server-error correction at `61e51dd8b` leaves every measured client
chunk and the inline capture byte-identical to parent `f9bd88e8e`. It adds
103 raw / 23 gzip / 51 Brotli bytes to the matched server bundle.

### Behavior and DOM work

WebKit 26.5 passes 12 measured cases per variant plus four warmups per variant
at this checkpoint. Controls cover edits before module loading, equal-value edit
revisions, delayed restore, trusted clicks, native form submission, retained
nodes, and server results adopted without replacement browser loaders.

In the maintained 1,000-publication comparison:

| Publications | Manual attribute mutations | Authored attribute mutations |
| --- | ---: | ---: |
| Unchanged state | 5,000 | 0 |
| Alternating state, equal final DOM | 7,000 | 6,000 |

These are MutationObserver record counts, not render counts or CPU measurements.
Timing includes event dispatch, snapshot creation, and observation overhead.
The alternating WebKit control did not establish a speedup. No paint, INP,
physical-device, or general application-latency improvement follows from this
table.

The lists in this workload keep their historical server HTML while live outputs
consume subsequent result waves. It does not measure renderer-free list
reconciliation, dynamic component rendering, or fetched-navigation placement.

## What the packaging changes achieved

The following are **historical matched experiments**, each with its own baseline
and complete workload. They explain why the boundaries changed. Their deltas
overlap and are not additive.

| Change | Matched observation | Tradeoff |
| --- | --- | --- |
| Separate server query observation and island-event capture from control-only startup | Eager behavior: 28,445 → 26,477 gzip bytes | Some code changed chunks; the server adapter added a small wrapper |
| Remove query construction from query-free owners | Receipt startup: 25,269 → 20,573 gzip bytes | Eventual delivery saved only 1,005 bytes; most startup savings defer real query work |
| Select a results-only receiver when the host owns placement | Receipt startup: 20,573 → 19,370 gzip bytes; eventual: 24,663 → 23,460 | The full receiver control grew 117 gzip bytes |
| Move unchanged class normalization into a dependency-free leaf | Split-renderer fixture eager: 4,718 → 2,478 gzip bytes | Eventual: 54,084 → 53,994; most style machinery remains available with the later renderer |

Each comparison retains equivalent visible behavior. The class-helper change
does not remove style functionality, and query-free startup does not remove
the optional consumer's queries. See
[the runtime experiments](./async-signals-runtime-experiments.md) for retained
and rejected designs.

### Packaging boundary follow-up (2026-09-12)

This comparison uses exact baseline `9661ee423` and the same compiler,
dependencies, fixture, and compression settings. It separates server query
observation from client requests and native-control capture from island intent.

| Physical delivery | Before raw | After raw | Before gzip-9 | After gzip-9 |
| --- | ---: | ---: | ---: | ---: |
| Eager behavior entry | 17,720 | 18,297 | 6,093 | 6,326 |
| Shared signal runtime and fixture state | 74,579 | 67,482 | 22,352 | 20,151 |
| Total eager, two files | 92,299 | 85,779 | 28,445 | 26,477 |
| Optional controller, outside eager total | 162 | 167 | 151 | 155 |

The whole eager graph saves 1,968 gzip bytes, not the shared chunk's reduction
alone. The inline capture is unchanged. The server fixture grows 120 gzip bytes.
This is a byte comparison, not a browser-speed measurement.

## Server work: improvements and remaining overhead

### Historical baseline comparison

The unchanged `benchmarks/streaming-ssr` fixture compared base `2789eab27`
with implementation `044050f57` using production Vite 8.1.5 builds, esbuild
0.28.1, source-built TSRX, Node 24.21.0, Darwin 25.6.0, and Apple M5 Max.

Four fresh processes ran A–B–B–A, each with five warmups and 150 timed renders
per scenario. All 24 correctness gates passed. The score is the runner's
selected late-window mean; these ranges are two per-process observations, not
confidence intervals.

| Stream completion | Baseline score range, ms | Candidate score range, ms | Midpoint change |
| --- | ---: | ---: | ---: |
| 10 cards | 0.191–0.193 | 0.190–0.205 | Overlap; inconclusive |
| 100 cards | 1.077–1.134 | 1.154–1.259 | +9.2% |
| 800 cards | 8.630–9.031 | 9.563–9.637 | +8.7% |
| 50 cards in reverse waves | 1.776–1.801 | 2.018–2.044 | +13.6% |

The 800-card shell increased from 1.769–1.830 to 2.218–2.227 ms, an observed
23.5% midpoint change. The fixture did not declare queries, but opaque member
text still enabled signal ownership. It is therefore not a proven
signal-capability-off control.

Profiles identified owner lookup and structural-path serialization among
material costs. They did not attribute the whole difference or establish a safe
small fix. Removing handle recognition would change supported behavior.
These observations remain a reason to measure common SSR paths, not a claim
that current code has the same precise overhead.

### Shared empty list-key storage

A narrower historical experiment replaced repeated empty list-key arrays with
one private readonly empty array. Keyed paths still extend by copying; identity,
request ownership, and save/restore semantics are unchanged.

In otherwise matched A–B–B–A builds, the 800-card completion score changed from
9.718–10.048 to 9.537–9.576 ms, an observed 3.3% midpoint reduction. Smaller
and timer-dominated cases overlapped or varied. The server bundle grew one
default-gzip byte, and client delivery did not change.

This removed an allocation site, not a measured number of heap bytes. It did
not establish an overall conversation-latency improvement.

### Avoiding duplicate requests is a correctness result

The [conversation benchmark](../benchmarks/conversation-streaming/README.md)
exposed a query that resumed after authorization outside the renderer observer.
Its dependent result streams were absent from the original response, so browser
activation started two extra requests.

Retaining the observer across the pending query description made the complete
flow use one server request rather than three, with all result values present.
The incomplete response is not an equivalent faster baseline. No before/after
latency claim is made for this repair.

## Browser observations and limits

The latest binding check above is Playwright WebKit, not installed Safari.
Earlier, separately recorded builds passed desktop Safari 26.6.2 keyboard
controls and iOS Simulator Safari 26.5 initial-conversation flows. Those runs
do not qualify the latest authored-binding implementation on iOS.

The authored-binding simulator check stopped before reaching the authored path:
native text entry failed in the unchanged manual control. That is missing
coverage, not a demonstrated binding defect. OS IME, physical-device
responsiveness, and native persisted BFCache remain unverified.

A separate historical open-stream check found that a module entry waited for
HTML EOF; a nonce-bearing classic `import()` launcher ran before EOF.
Another same-origin recovery observation followed an aborted module request,
but lacked the failed response's complete headers and resource trace.
Neither proves a general Safari loader defect. Public hypotheses and the checks
needed to distinguish them are in [the Safari investigation](./safari-esm-investigation.md).

## Reproducing and interpreting results

Start with the maintained runners, not another machine's temporary output paths:

```sh
node benchmarks/bench.mjs --quick conversation-streaming
node benchmarks/conversation-streaming/behavior-only/build.mjs --composer-receipts --bundler=vite --projection=manual
node benchmarks/conversation-streaming/behavior-only/build.mjs --composer-receipts --bundler=vite --projection=authored
node benchmarks/scoped-signals/run-async-retention.mjs --cycles=1000
node benchmarks/scoped-signals/run-async-retention.mjs --api=derived --cycles=1000
```

The benchmark READMEs document browser execution, output selection, and
`--build-dir` reuse. Compare identical fixtures, toolchains, options, and
complete results; retain source/output hashes, raw samples, and correctness
controls. Run timing without overlapping builds or tests.

The September 14 local build/browser reports identify `61e51dd8b` and the
manual/authored variants. They are local evidence, not downloadable CI artifacts.
Some earlier temporary timing artifacts are no longer available, so the historical
tables cannot be freshly audited from those raw samples. Maintained runners make
new measurements reproducible; they do not recreate an old machine run.

Report costs separately:

- Inline HTML scripts and serialized data, critical CSS, initial JavaScript,
  automatic later loading, and interaction-triggered loading.
- Unique compressed emitted files versus actual network transfer, cache hits,
  repeated requests, and stream framing.
- Server work versus browser work; DOM readiness versus paint or INP.
- Isolated export bundles versus complete split application graphs. Export
  bundles overlap and cannot be summed as page weight.

The RFC's broader performance acceptance remains open: precise feature-off shared
cost, large repeated SSR work, fetched-navigation timing, concurrent throughput,
allocations, peak memory, and native mobile interaction. Moving work to another
phase is not removing it.
