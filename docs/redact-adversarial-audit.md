# Redact-derived adversarial contract audit (generated)

<!-- GENERATED FILE — do not edit. Regenerate with `pnpm redact-audit:generate`. -->

This is a source-backed extraction ledger for consumer-observable failure modes found in [TanStack Redact](https://github.com/TanStack/redact). Redact is an adversity source, not an implementation target or a blanket compatibility promise. Classifications describe whether each contract transfers to Octane; statuses describe the current Octane evidence or follow-up.

The authored source is [`packages/octane/audit/redact-adversarial-ledger.json`](../packages/octane/audit/redact-adversarial-ledger.json). Permanent IDs must not be renamed or reused.

## Upstream snapshot

- Repository: [`https://github.com/TanStack/redact`](https://github.com/TanStack/redact)
- Commit: [`e1620a13aab8935c806238f117ba58559b7cd002`](https://github.com/TanStack/redact/commit/e1620a13aab8935c806238f117ba58559b7cd002)
- Captured: 2026-07-22
- Issues reviewed: #17
- Pull requests reviewed: #1, #2, #3, #4, #5, #6, #7, #8, #9, #10, #11, #12, #13, #14, #15, #16
- Repository paths reviewed: `packages/redact/src/core`, `packages/redact/src/dom`, `packages/redact/src/react`, `packages/redact/src/scheduler`, `packages/redact/src/server`, `packages/redact/src/vite`, `scripts`, `tests`

### Audited artifact dispositions

This is the explicit artifact sample reviewed at the pinned snapshot; broad source paths above do not imply that every file was mined. `mapped` artifacts have an exact upstream test source, while `folded` artifacts were inspected and assigned to an existing contract without duplicating every case.

| Artifact | Disposition | Ledger IDs | Note |
| --- | --- | --- | --- |
| `tests/callback-ref-commit-phase.test.tsx` | mapped | [`RDX-REF-001`](#rdx-ref-001) | Exact source mapping. |
| `tests/child-reorder.test.tsx` | mapped | [`RDX-REC-001`](#rdx-rec-001) | Exact source mapping. |
| `tests/controlled-input.test.tsx` | folded | [`RDX-EVT-001`](#rdx-evt-001) | The native-event observation boundary transfers; Redact's synthetic onChange mapping is an explicit Octane divergence. |
| `tests/create-root-clear-container.test.tsx` | mapped | [`RDX-ROOT-001`](#rdx-root-001) | Exact source mapping. |
| `tests/document-hydration.test.tsx` | mapped | [`RDX-HYD-001`](#rdx-hyd-001), [`RDX-HYD-002`](#rdx-hyd-002), [`RDX-HYD-003`](#rdx-hyd-003), [`RDX-HYD-004`](#rdx-hyd-004), [`RDX-HYD-007`](#rdx-hyd-007) | Exact source mapping. |
| `tests/event-replay.test.ts` | mapped | [`RDX-EVT-002`](#rdx-evt-002) | Exact source mapping. |
| `tests/external-store-unmount.test.tsx` | mapped | [`RDX-STORE-001`](#rdx-store-001) | Exact source mapping. |
| `tests/floating-ui-pattern.test.tsx` | mapped | [`RDX-PORT-002`](#rdx-port-002) | Exact source mapping. |
| `tests/hydration-mismatch-recovery.test.tsx` | mapped | [`RDX-HYD-006`](#rdx-hyd-006) | Exact source mapping. |
| `tests/hydration.test.tsx` | mapped | [`RDX-ID-001`](#rdx-id-001) | Exact source mapping. |
| `tests/memo-state-rerender.test.tsx` | mapped | [`RDX-MEM-001`](#rdx-mem-001) | Exact source mapping. |
| `tests/place-children-anchor.test.tsx` | mapped | [`RDX-REC-002`](#rdx-rec-002) | Exact source mapping. |
| `tests/portal-doctype.test.tsx` | mapped | [`RDX-PORT-001`](#rdx-port-001), [`RDX-SSR-002`](#rdx-ssr-002) | Exact source mapping. |
| `tests/public-exports.test.ts` | mapped | [`RDX-PKG-001`](#rdx-pkg-001) | Exact source mapping. |
| `tests/react-integration/reconnecting.test.tsx` | folded | [`RDX-HYD-006`](#rdx-hyd-006), [`RDX-NON-001`](#rdx-non-001) | Host reconnecting outcomes transfer; class-component cases are explicit non-goals. |
| `tests/security.test.tsx` | mapped | [`RDX-SEC-001`](#rdx-sec-001) | Exact source mapping. |
| `tests/ssr-context.test.tsx` | mapped | [`RDX-SSR-001`](#rdx-ssr-001) | Exact source mapping. |
| `tests/ssr.test.tsx` | mapped | [`RDX-SSR-001`](#rdx-ssr-001) | Exact source mapping. |
| `tests/streaming-hydration.test.tsx` | folded | [`RDX-HYD-001`](#rdx-hyd-001), [`RDX-SSR-001`](#rdx-ssr-001) | The cases reinforce streamed-boundary recovery and transactional streaming entries. |
| `tests/suspense-preserves-dom.test.tsx` | mapped | [`RDX-SUS-001`](#rdx-sus-001) | Exact source mapping. |
| `tests/use-effect-coalesced-renders.test.tsx` | mapped | [`RDX-LIF-001`](#rdx-lif-001) | Exact source mapping. |
| `tests/vite-plugin.test.ts` | folded | [`RDX-CFG-001`](#rdx-cfg-001), [`RDX-PKG-002`](#rdx-pkg-002) | Redact-specific React aliases are excluded; option-to-output and environment-routing lessons transfer. |

## Entry contract

- Keep one consumer-observable owning contract per permanent ID; split an upstream issue or pull request when it exposes independent contracts.
- The append-only `idRegistry` retains retired IDs as tombstones. Never rename, remove, or reuse a registered ID; retire it with rationale and mint a new ID when the owning contract changes.
- A `covered` entry cites an exact executable Octane test. A `planned` entry carries a bounded next action. A `decision required` entry records the decision owner and acceptance boundary.
- A `documented` entry is terminal only for an explained divergence/non-goal or a portable process policy backed exclusively by documentation/benchmark references.
- Keep resolved, divergent, and non-goal entries in the ledger so future audits do not rediscover them or silently import Redact-specific behavior.
- Choose tests by observable. Final markup alone cannot prove identity, focus, selection, scroll, live properties, lifecycle ordering, or global error behavior.
- Update the authored JSON, then run `pnpm redact-audit:generate`; never hand-edit this report.

## Summary

| Status | Entries |
| --- | ---: |
| planned | 6 |
| in progress | 0 |
| covered | 17 |
| documented | 5 |
| decision required | 1 |
| blocked | 0 |

| Classification | Entries |
| --- | ---: |
| portable | 12 |
| adaptable | 13 |
| divergence | 2 |
| non goal | 2 |

## Open priority queue

| ID | Risk | Area | Contract | Status | Owner |
| --- | --- | --- | --- | --- | --- |
| [`RDX-EVT-002`](#rdx-evt-002) | high | event-replay | Hydration event replay preserves platform event shape and queue semantics | planned | Octane deferred hydration and DOM events |
| [`RDX-HYD-003`](#rdx-hyd-003) | high | raw-text-hydration | Raw script and style hydration must use their parsing contexts | planned | Octane DOM hydration and SSR serialization |
| [`RDX-HYD-006`](#rdx-hyd-006) | high | hydration-recovery | Mismatch recovery is bounded to the failed ownership scope | planned | Octane hydration cursor and ownership ranges |
| [`RDX-HYD-007`](#rdx-hyd-007) | high | head-hydration | Head ownership keys are unique across compiled modules and tags | planned | Octane compiler and runtime head hydration |
| [`RDX-PORT-002`](#rdx-port-002) | high | portal-updates | A stateful portal descendant resolves its foreign host for owned updates | planned | Octane portal host resolution |
| [`RDX-REC-002`](#rdx-rec-002) | high | reconciliation-placement | Topology transitions use the correct absolute anchor without stable reattachment | planned | Octane reconciler and portal placement |
| [`RDX-HYD-005`](#rdx-hyd-005) | medium | hydration-errors | Hydration recovery reporting has an explicit public contract | decision required | Octane public root API |

## Contract ledger

### build-configuration

<a id="rdx-cfg-001"></a>

#### RDX-CFG-001 — Public options must change the emitted build at their observation boundary

**Disposition:** medium risk; adaptable; covered; owner: Octane compiler and Vite/Rspack/Rsbuild/Rspeedy integrations.

**Upstream evidence**

- [pull request #15](https://github.com/TanStack/redact/pull/15) — fix(redact/vite): respect 'forwardRef' and 'classComponents' feature flags
- [commit 04f39662123a](https://github.com/TanStack/redact/commit/04f39662123a2ca9c896dca0a35429b0554a4847)

**Consumer-visible symptom.** A documented false-valued feature flag silently left the full implementation in the bundle because an internal folder name was cast to an unrelated public option key.

**Octane contract.** Every public compiler or bundler boolean must be traced through each adapter's resolved host configuration and the owning compiler's emitted code, module resolution, bundle contents, or runtime behavior. Pass-through host build controls lock both values in resolved configuration; options with Octane-owned output also require an executable output or bundle proof.

**Applicable modes:** `production-compile`, `vite-client`, `vite-ssr`, `rspack`, `rsbuild`, `rspeedy`. **Observables:** `emitted-code`, `resolved-configuration`, `bundle-contents`, `package-resolution`.

**Octane references**

- [packages/octane/tests/compiler-vite-options.test.ts](../packages/octane/tests/compiler-vite-options.test.ts) — “changes emitted hot-update support for both hmr values” — Direct Vite integration coverage for explicit HMR, SSR-mode, and ownership booleans.
- [packages/rspack-plugin-octane/tests/rspack.test.ts](../packages/rspack-plugin-octane/tests/rspack.test.ts) — “erases profiling and full diagnostics from a real production bundle” — Real bundle proof for the disabled profiling path; the adjacent profiled-runtime test covers the enabled path.
- [packages/rsbuild-plugin-octane/tests/target.test.ts](../packages/rsbuild-plugin-octane/tests/target.test.ts) — “maps build.minify=false to webworker optimization” — Preserves both values of the shared app build boolean.
- [packages/rspeedy-plugin-octane/tests/plugin.test.ts](../packages/rspeedy-plugin-octane/tests/plugin.test.ts) — “preserves an asymmetric public-boolean matrix in the installed Rspack integration” — Locks the newest public Rspack-backed adapter into an asymmetric option matrix that detects cross-wiring.

**Executable evidence**

- [changes emitted hot-update support for both hmr values](../packages/octane/tests/compiler-vite-options.test.ts) — modes: `vite-client`; observables: `emitted-code`
- [forces server output despite a client transform signal](../packages/octane/tests/compiler-vite-options.test.ts) — modes: `production-compile`, `vite-client`, `vite-ssr`; observables: `emitted-code`
- [forces client output despite a server transform signal](../packages/octane/tests/compiler-vite-options.test.ts) — modes: `production-compile`, `vite-client`, `vite-ssr`; observables: `emitted-code`
- [changes ownership of an unmarked project TSX module for both directive values](../packages/octane/tests/compiler-vite-options.test.ts) — modes: `vite-client`, `vite-ssr`; observables: `emitted-code`
- [preserves both hmr values at the compiler output boundary](../packages/vite-plugin-octane/tests/plugin.test.ts) — modes: `vite-client`; observables: `emitted-code`
- [preserves both requireDirective values at the compiler ownership boundary](../packages/vite-plugin-octane/tests/plugin.test.ts) — modes: `vite-client`; observables: `emitted-code`
- [preserves build.minify=true and build.target=false in resolved Vite config](../packages/vite-plugin-octane/tests/plugin.test.ts) — modes: `production-compile`, `vite-client`; observables: `resolved-configuration`
- [preserves build.minify=false and build.target=false in resolved Vite config](../packages/vite-plugin-octane/tests/plugin.test.ts) — modes: `production-compile`, `vite-client`; observables: `resolved-configuration`
- [erases profiling from normal builds and installs it in profile builds](../packages/vite-plugin-octane/tests/profile-bundle.test.ts) — modes: `production-compile`, `vite-client`; observables: `bundle-contents`
- [removes hot-update output when hmr is explicitly false in a hot compilation](../packages/rspack-plugin-octane/tests/loader.integration.test.ts) — modes: `rspack`; observables: `emitted-code`
- [changes development metadata for both explicit dev values](../packages/rspack-plugin-octane/tests/loader.integration.test.ts) — modes: `rspack`; observables: `emitted-code`
- [gates ownership behind requireDirective and reports forgotten pragmas](../packages/rspack-plugin-octane/tests/loader.integration.test.ts) — modes: `rspack`; observables: `emitted-code`
- [honors explicit client mode and serializable loader options](../packages/rspack-plugin-octane/tests/plugin.test.ts) — modes: `rspack`; observables: `resolved-configuration`
- [transpiles TypeScript only when plugin transpilation is enabled](../packages/rspack-plugin-octane/tests/rspack.test.ts) — modes: `rspack`; observables: `bundle-contents`
- [splits client-only renderer dependencies from the raw server graph with stable module identity](../packages/rspack-plugin-octane/tests/rspack.test.ts) — modes: `rspack`; observables: `bundle-contents`, `package-resolution`
- [erases profiling and full diagnostics from a real production bundle](../packages/rspack-plugin-octane/tests/rspack.test.ts) — modes: `rspack`, `production-compile`; observables: `bundle-contents`
- [executes the profiled runtime](../packages/rspack-plugin-octane/tests/rspack.test.ts) — modes: `rspack`, `production-compile`; observables: `bundle-contents`
- [preserves asymmetric public compiler booleans through custom client/server environments](../packages/rsbuild-plugin-octane/tests/renderer-config.test.ts) — modes: `rsbuild`; observables: `resolved-configuration`
- [maps build.minify=true to webworker optimization](../packages/rsbuild-plugin-octane/tests/target.test.ts) — modes: `rsbuild`, `production-compile`; observables: `resolved-configuration`
- [maps build.minify=false to webworker optimization](../packages/rsbuild-plugin-octane/tests/target.test.ts) — modes: `rsbuild`, `production-compile`; observables: `resolved-configuration`
- [maps build.target=false without dropping the false-valued configuration](../packages/rsbuild-plugin-octane/tests/target.test.ts) — modes: `rsbuild`, `production-compile`; observables: `resolved-configuration`
- [emits profiling only in the client production bundle](../packages/rsbuild-plugin-octane/tests/target.test.ts) — modes: `rsbuild`, `production-compile`; observables: `bundle-contents`
- [preserves an asymmetric public-boolean matrix in the installed Rspack integration](../packages/rspeedy-plugin-octane/tests/plugin.test.ts) — modes: `rspeedy`; observables: `resolved-configuration`
- [removes hot-update entries when hmr is explicitly false in development](../packages/rspeedy-plugin-octane/tests/plugin.test.ts) — modes: `rspeedy`; observables: `resolved-configuration`
- [assembles a normal Octane application and generated receiver into a native bundle](../packages/rspeedy-plugin-octane/tests/build.test.ts) — modes: `rspeedy`; observables: `bundle-contents`, `package-resolution`

**Rationale.** Redact's forwardRef and class-component flags are out of scope. Octane's inventory composes adapter-level resolved-configuration checks with executable owning-compiler proofs, including real Vite/Rspack/Rsbuild/Rspeedy bundles, renderer routing, shared minification, Rspack transpilation, and the false-valued target sentinel. Diagnostic-only compiler escape hatches and unrelated runtime/server config are excluded.


### document-serialization

<a id="rdx-ssr-002"></a>

#### RDX-SSR-002 — Doctype ownership is explicit for each server rendering API

**Disposition:** high risk; divergence; covered; owner: Octane server render APIs.

**Upstream evidence**

- [test: prepends a DOCTYPE when the root element is &lt;html&gt;](https://github.com/TanStack/redact/blob/e1620a13aab8935c806238f117ba58559b7cd002/tests/portal-doctype.test.tsx#L115-L135) (`tests/portal-doctype.test.tsx`)
- [test: does not prepend a DOCTYPE for non-html roots](https://github.com/TanStack/redact/blob/e1620a13aab8935c806238f117ba58559b7cd002/tests/portal-doctype.test.tsx#L137-L150) (`tests/portal-doctype.test.tsx`)

**Consumer-visible symptom.** A document response omitted or misplaced its doctype and entered quirks mode, or a fragment unexpectedly received a document preamble.

**Octane contract.** Pipeable &lt;html&gt; document streams contain exactly one &lt;!DOCTYPE html&gt;, and readable &lt;html&gt; streams begin with that doctype; the shared serializer emits none for non-document roots, directly exercised through the pipeable API; renderToString and renderToStaticMarkup remain doctype-free so the embedding framework owns buffered preambles.

**Applicable modes:** `server-string`, `server-static`, `server-stream`. **Observables:** `markup`, `streaming`.

**Octane references**

- [docs/ssr.md](../docs/ssr.md) — Documents streaming-only doctype ownership and buffered framework composition.
- [packages/octane/tests/streaming-ssr-injection.test.ts](../packages/octane/tests/streaming-ssr-injection.test.ts) — Covers injected/non-injected document streams, fragments, web streams, and buffered APIs.

**Executable evidence**

- [streamed documents lead with &lt;!DOCTYPE html&gt; without any injection source](../packages/octane/tests/streaming-ssr-injection.test.ts) — modes: `server-stream`; observables: `markup`, `streaming`
- [streamed documents lead with &lt;!DOCTYPE html&gt; through the web-stream API](../packages/octane/tests/streaming-ssr-injection.test.ts) — modes: `server-stream`; observables: `markup`, `streaming`
- [streamed fragments never receive a doctype](../packages/octane/tests/streaming-ssr-injection.test.ts) — modes: `server-stream`; observables: `markup`, `streaming`
- [buffered renderers stay doctype-free for document roots, matching React](../packages/octane/tests/streaming-ssr-injection.test.ts) — modes: `server-string`, `server-static`; observables: `markup`

**Rationale.** Redact's buffered renderer prepends a doctype for an &lt;html&gt; root. Octane intentionally matches React's API split: streaming owns the document preamble, while buffered output remains composable. The transferable contract is explicit API ownership, not identical bytes across unlike APIs.


### documentation

<a id="rdx-doc-001"></a>

#### RDX-DOC-001 — Surface, protocol, and size documentation must follow executable evidence

**Disposition:** medium risk; portable; documented; owner: Octane documentation and release tooling.

**Upstream evidence**

- [pull request #3](https://github.com/TanStack/redact/pull/3) — docs: update SURFACE.md and SAVINGS_ANALYSIS.md for @tanstack/redact
- [pull request #13](https://github.com/TanStack/redact/pull/13) — docs(redact/server): correct fallback wire-format comment — fallback '&lt;div&gt;' is visible, not hidden

**Consumer-visible symptom.** Published size numbers, package layout, or streaming wire-format commentary drifted away from the scripts and bytes that users actually received.

**Octane contract.** Measured claims and protocol descriptions must cite the live generator, benchmark, emitted fixture, or focused test that makes them reviewable.

**Applicable modes:** `server-stream`, `benchmark`. **Observables:** `streaming`, `performance`.

**Octane references**

- [docs/project-analysis-concerns.md](../docs/project-analysis-concerns.md) — Distinguishes current source-backed claims from historical plans.
- [benchmarks/README.md](../benchmarks/README.md) — Defines comparable baselines and the repository benchmark contract.

**Rationale.** This is a maintenance rule rather than an independent runtime workstream.


### effects

<a id="rdx-lif-001"></a>

#### RDX-LIF-001 — Coalesced dependency changes leave one live passive side effect

**Disposition:** high risk; portable; covered; owner: Octane scheduler and effect hooks.

**Upstream evidence**

- [test: does not leak side-effects when two deps-changing renders coalesce before passive drain](https://github.com/TanStack/redact/blob/e1620a13aab8935c806238f117ba58559b7cd002/tests/use-effect-coalesced-renders.test.tsx#L13-L57) (`tests/use-effect-coalesced-renders.test.tsx`)

**Consumer-visible symptom.** Two renders before the passive queue drained installed multiple imperative artifacts because cleanup ownership was cleared before the intermediate body ran.

**Octane contract.** After any coalesced dependency-changing render sequence, at most one passive side effect is live; each installed effect is cleaned exactly once, including final unmount.

**Applicable modes:** `client`, `production-compile`. **Observables:** `markup`, `effects`.

**Octane references**

- [packages/octane/tests/effect-timing.test.ts](../packages/octane/tests/effect-timing.test.ts) — “coalesced dependency changes leave one live passive side effect” — Commits b, requests c before the ordinary passive task drains, and proves Octane settles b's queued passive work before the c render while preserving one live artifact and exactly-once cleanup.

**Executable evidence**

- [coalesced dependency changes leave one live passive side effect](../packages/octane/tests/effect-timing.test.ts) — modes: `client`, `production-compile`; observables: `markup`, `effects`

**Rationale.** Same-batch root renders coalesce before an intermediate effect can enqueue. When an intermediate revision does commit, Octane drains its pending passive work before the next render begins. The portable single-live-artifact and exactly-once cleanup contract therefore holds without exposing Redact's two-entry queue shape.


### event-replay

<a id="rdx-evt-002"></a>

#### RDX-EVT-002 — Hydration event replay preserves platform event shape and queue semantics

**Disposition:** high risk; adaptable; planned; owner: Octane deferred hydration and DOM events.

**Upstream evidence**

- [test: replays buffered events with browser-compatible event subclasses](https://github.com/TanStack/redact/blob/e1620a13aab8935c806238f117ba58559b7cd002/tests/event-replay.test.ts#L12-L68) (`tests/event-replay.test.ts`)

**Consumer-visible symptom.** A replay queue delivered the right event names but degraded keyboard and input events to generic Event objects, lost target/default semantics, changed order, or replayed an item twice.

**Octane contract.** For every event Octane buffers, replay must preserve the documented platform subclass and supported metadata, original target, FIFO order, bubbling/cancelability/default behavior, and exactly-once delivery.

**Applicable modes:** `deferred-hydration`, `real-browser`. **Observables:** `events`.

**Octane references**

- [packages/octane/src/runtime.ts](../packages/octane/src/runtime.ts) — `notifyHydrateBoundary` — Mouse and focus families retain subclasses; other buffered families currently fall back to Event.
- [packages/octane/tests/streaming-ssr.test.ts](../packages/octane/tests/streaming-ssr.test.ts) — “replays pre-root interaction after the pending stream reveals” — Covers click delivery and target survival, not the cross-family event-shape matrix.

**Next action (test).** Exercise every public HydrationInteractionEvent family in a real browser: click/auxclick/contextmenu/dblclick, focusin, keydown/keyup, mouse, and pointer events. Assert subclass, supported metadata, target, FIFO ordering, preventDefault visibility, queue drain, and no duplicate replay; keep input/change/submit excluded unless a separate API decision expands the public union.

Targets: `packages/octane/tests/hydration/deferred-hydration-contract.test.ts`, `packages/octane/tests/browser`.

**Rationale.** Octane replays interaction intent rather than cloning every native event field, so the transferable contract must explicitly define which event shape it promises instead of silently copying Redact's implementation.


### events

<a id="rdx-evt-001"></a>

#### RDX-EVT-001 — Native form events must be exercised, without importing synthetic onChange

**Disposition:** high risk; divergence; documented; owner: Octane DOM events and forms.

**Upstream evidence**

- [pull request #1](https://github.com/TanStack/redact/pull/1) — fix(react-dom): fire onChange on every keystroke for text inputs
- [commit 1da7232dbe16](https://github.com/TanStack/redact/commit/1da7232dbe1658971219b6a83f2f44a4f1b5ff16)

**Consumer-visible symptom.** Initial form markup looked correct while real editing was dead because the tests never dispatched the platform event that drives the control.

**Octane contract.** Controlled-property tests must dispatch real native input/change events and assert handler delivery, live-property reassertion, and dynamic input-type behavior.

**Applicable modes:** `client`, `hydrate-match`, `production-compile`, `real-browser`. **Observables:** `events`, `live-properties`, `markup`.

**Octane references**

- [docs/differences-from-react.md](../docs/differences-from-react.md) — Octane deliberately uses onInput per edit and native change on commit.
- [packages/octane/tests/browser/native-change/native-change.test.ts](../packages/octane/tests/browser/native-change/native-change.test.ts) — “fires Octane change on focus commit while React derives it from each input” — Real-browser native change contract.

**Rationale.** Adopt Redact's event-level observation boundary, but reject its synthetic onChange-to-input mapping because that conflicts with Octane's documented native-event model.


### external-store

<a id="rdx-store-001"></a>

#### RDX-STORE-001 — External-store subscription races cannot create zombie DOM

**Disposition:** high risk; portable; covered; owner: Octane useSyncExternalStore and scheduler.

**Upstream evidence**

- [test: subscribes after render when the store synchronously notifies](https://github.com/TanStack/redact/blob/e1620a13aab8935c806238f117ba58559b7cd002/tests/external-store-unmount.test.tsx#L47-L81) (`tests/external-store-unmount.test.tsx`)
- [test: store notifications after unmount do not resurrect DOM](https://github.com/TanStack/redact/blob/e1620a13aab8935c806238f117ba58559b7cd002/tests/external-store-unmount.test.tsx#L116-L156) (`tests/external-store-unmount.test.tsx`)

**Consumer-visible symptom.** Subscription ran during render or a stale listener scheduled an unmounted component, causing removed UI to reappear in its former host.

**Octane contract.** useSyncExternalStore subscribes after render, converges when subscribe synchronously notifies, unsubscribes on conditional/root removal, and ignores every post-unmount notification.

**Applicable modes:** `client`, `production-compile`. **Observables:** `markup`, `node-identity`, `effects`.

**Octane references**

- [packages/octane/tests/sync-external-store.test.ts](../packages/octane/tests/sync-external-store.test.ts) — “subscribes outside render and converges when subscribe notifies synchronously” — Proves subscription timing at the public callback boundary and commits the synchronously published snapshot without resubscribing.
- [packages/octane/tests/sync-external-store.test.ts](../packages/octane/tests/sync-external-store.test.ts) — “unsubscribes on unmount (store drops its listener)”
- [packages/octane/tests/sync-external-store.test.ts](../packages/octane/tests/sync-external-store.test.ts) — “unsubscribes when its conditional owner removes it”
- [packages/octane/tests/sync-external-store.test.ts](../packages/octane/tests/sync-external-store.test.ts) — “ignores a retained stale callback after conditional removal” — Invokes the exact callback retained by the store and proves the removed reader stays absent while unrelated host and sibling objects survive.
- [packages/octane/src/runtime.ts](../packages/octane/src/runtime.ts) — `useSyncExternalStore`

**Executable evidence**

- [subscribes outside render and converges when subscribe notifies synchronously](../packages/octane/tests/sync-external-store.test.ts) — modes: `client`, `production-compile`; observables: `markup`, `effects`
- [unsubscribes on unmount (store drops its listener)](../packages/octane/tests/sync-external-store.test.ts) — modes: `client`, `production-compile`; observables: `effects`
- [unsubscribes when its conditional owner removes it](../packages/octane/tests/sync-external-store.test.ts) — modes: `client`, `production-compile`; observables: `markup`, `effects`
- [ignores a retained stale callback after conditional removal](../packages/octane/tests/sync-external-store.test.ts) — modes: `client`, `production-compile`; observables: `markup`, `node-identity`, `effects`

**Rationale.** Octane subscribes through a passive effect, owns unsubscribe in that effect slot, and schedules notifications onto a block whose disposed guards make stale callbacks inert after removal.


### head-hydration

<a id="rdx-hyd-002"></a>

#### RDX-HYD-002 — Hoisted head markers must only claim the intended element

**Disposition:** critical risk; adaptable; covered; owner: Octane compiler and runtime head hydration.

**Upstream evidence**

- [issue #17](https://github.com/TanStack/redact/issues/17) — Hydration bugs: async-resume mismatch escapes uncaught; head-script claiming; innerHTML probe escaping; foreign-node strictness
- [test: claims typeless and typed head scripts in document order](https://github.com/TanStack/redact/blob/e1620a13aab8935c806238f117ba58559b7cd002/tests/document-hydration.test.tsx#L171-L206) (`tests/document-hydration.test.tsx`)

**Consumer-visible symptom.** Weak head-node identity allowed one logical head entry to adopt a different server node and validate or update the wrong content.

**Octane contract.** Within a matching head-marker interval, hydration adopts only an element with the expected tag. It preserves interposed wrong-tag nodes and, when no expected-tag candidate exists before the next Octane marker, creates the expected node without claiming unrelated head content.

**Applicable modes:** `server-string`, `hydrate-match`, `hydrate-mismatch`, `production-compile`. **Observables:** `markup`, `node-identity`, `dom-mutations`.

**Octane references**

- [packages/octane/src/runtime.ts](../packages/octane/src/runtime.ts) — `adoptServerHeadEl` — Claims only a matching tag inside the ownership interval closed by the next Octane head marker.
- [packages/octane/tests/hydration/head-hydrate.test.ts](../packages/octane/tests/hydration/head-hydrate.test.ts) — “adopts the server head (one &lt;title&gt;/&lt;meta&gt;, markers removed) + single-root body, removed on unmount” — Happy-path adoption and lifecycle ownership.
- [packages/octane/tests/hydration/head-hydrate.test.ts](../packages/octane/tests/hydration/head-hydrate.test.ts) — “skips an interposed foreign element and adopts the intended head element”
- [packages/octane/tests/hydration/head-hydrate.test.ts](../packages/octane/tests/hydration/head-hydrate.test.ts) — “creates a missing expected head element without claiming a wrong-tag neighbor”

**Executable evidence**

- [adopts the server head (one &lt;title&gt;/&lt;meta&gt;, markers removed) + single-root body, removed on unmount](../packages/octane/tests/hydration/head-hydrate.test.ts) — modes: `server-string`, `hydrate-match`, `production-compile`; observables: `markup`, `node-identity`, `dom-mutations`
- [skips an interposed foreign element and adopts the intended head element](../packages/octane/tests/hydration/head-hydrate.test.ts) — modes: `server-string`, `hydrate-mismatch`, `production-compile`; observables: `markup`, `node-identity`, `dom-mutations`
- [creates a missing expected head element without claiming a wrong-tag neighbor](../packages/octane/tests/hydration/head-hydrate.test.ts) — modes: `server-string`, `hydrate-mismatch`, `production-compile`; observables: `markup`, `node-identity`, `dom-mutations`

**Rationale.** Redact matches scripts by attributes while Octane uses compiler markers, so the transferable contract is ownership-safe claiming rather than Redact's matcher. This closes wrong-tag and missing-target corruption within one marker interval. Compiler key uniqueness and ambiguous same-tag collisions remain explicitly tracked by RDX-HYD-007.

<a id="rdx-hyd-007"></a>

#### RDX-HYD-007 — Head ownership keys are unique across compiled modules and tags

**Disposition:** high risk; adaptable; planned; owner: Octane compiler and runtime head hydration.

**Upstream evidence**

- [issue #17](https://github.com/TanStack/redact/issues/17) — Hydration bugs: async-resume mismatch escapes uncaught; head-script claiming; innerHTML probe escaping; foreign-node strictness
- [test: claims typeless and typed head scripts in document order](https://github.com/TanStack/redact/blob/e1620a13aab8935c806238f117ba58559b7cd002/tests/document-hydration.test.tsx#L171-L206) (`tests/document-hydration.test.tsx`)

**Consumer-visible symptom.** A marker derived only from a source offset can collide across modules or tags, making same-tag ownership ambiguous even when runtime claiming validates the element tag.

**Octane contract.** Compiler-emitted head ownership keys are stable between server and client builds and collision-resistant across modules, tags, and multiple roots; duplicate, reordered, or missing markers cannot make one logical entry claim another same-tag element.

**Applicable modes:** `server-string`, `server-stream`, `hydrate-match`, `hydrate-mismatch`, `production-compile`. **Observables:** `markup`, `node-identity`, `dom-mutations`.

**Octane references**

- [packages/octane/src/compiler/compile.js](../packages/octane/src/compiler/compile.js) — `headKey` — The current key hashes only the element source position, which is unique within one file but not across modules.
- [packages/octane/src/runtime.ts](../packages/octane/src/runtime.ts) — `adoptServerHeadEl` — Tag validation closes wrong-tag claiming but cannot distinguish colliding same-tag owners.

**Next action (implementation).** Define a server/client-stable module-aware key, prove identical compilation modes emit the same key, and cover cross-module same-tag collisions plus duplicate, missing, and reordered markers without claiming or deleting unrelated head nodes.

Targets: `packages/octane/src/compiler/compile.js`, `packages/octane/tests/compiler.test.ts`, `packages/octane/tests/hydration/head-hydrate.test.ts`.

**Rationale.** RDX-HYD-002 deliberately closes the runtime's wrong-tag corruption without overstating marker identity. Redact's ownership failure exposed this distinct Octane compiler protocol risk, which needs a cross-module fixture rather than another adjacent-node unit case.


### host-serialization-security

<a id="rdx-sec-001"></a>

#### RDX-SEC-001 — Untrusted host values remain inside their parser and execution boundaries

**Disposition:** critical risk; adaptable; covered; owner: Octane DOM application and server serialization.

**Upstream evidence**

- [test: escapes &lt;, &gt;, &amp; in text children](https://github.com/TanStack/redact/blob/e1620a13aab8935c806238f117ba58559b7cd002/tests/security.test.tsx#L15-L19) (`tests/security.test.tsx`)
- [test: escapes quotes in attribute values](https://github.com/TanStack/redact/blob/e1620a13aab8935c806238f117ba58559b7cd002/tests/security.test.tsx#L34-L40) (`tests/security.test.tsx`)
- [test: breaks an attempted &lt;/script&gt; inside script body](https://github.com/TanStack/redact/blob/e1620a13aab8935c806238f117ba58559b7cd002/tests/security.test.tsx#L52-L64) (`tests/security.test.tsx`)
- [test: breaks an attempted &lt;/style&gt; inside style body](https://github.com/TanStack/redact/blob/e1620a13aab8935c806238f117ba58559b7cd002/tests/security.test.tsx#L66-L78) (`tests/security.test.tsx`)
- [test: does not allow CSS injection via style values containing quotes](https://github.com/TanStack/redact/blob/e1620a13aab8935c806238f117ba58559b7cd002/tests/security.test.tsx#L123-L132) (`tests/security.test.tsx`)
- [test: only attaches function event handlers — string handlers are silently ignored](https://github.com/TanStack/redact/blob/e1620a13aab8935c806238f117ba58559b7cd002/tests/security.test.tsx#L134-L157) (`tests/security.test.tsx`)
- [test: only honors the `__html` key — extra keys are ignored](https://github.com/TanStack/redact/blob/e1620a13aab8935c806238f117ba58559b7cd002/tests/security.test.tsx#L159-L174) (`tests/security.test.tsx`)

**Consumer-visible symptom.** Untrusted text, attributes, styles, raw-text bodies, event props, or malformed raw-HTML objects crossed into executable markup or a neighboring parser context.

**Octane contract.** Untrusted values remain within their owning text, attribute, style, or raw-text parser context at each tested serialization boundary; streamed raw script and style bodies remain confined as chunks are emitted. Raw HTML requires the __html shape, and non-function delegated event values never execute as handlers.

**Applicable modes:** `client`, `server-string`, `server-static`, `server-stream`, `production-compile`. **Observables:** `markup`, `events`, `errors`.

**Octane references**

- [packages/octane/tests/conformance/dom-component-ssr.test.ts](../packages/octane/tests/conformance/dom-component-ssr.test.ts) — “escapes text content and attribute values (round-trip)”
- [packages/octane/tests/conformance/fizz-main-wave4c.test.ts](../packages/octane/tests/conformance/fizz-main-wave4c.test.ts) — “keeps valid inline script characters while preventing closing-tag injection”
- [packages/octane/tests/conformance/invalid-listeners.test.ts](../packages/octane/tests/conformance/invalid-listeners.test.ts) — “a $label listener warns at render and reports an Error at dispatch”

**Executable evidence**

- [escapes text content and attribute values (round-trip)](../packages/octane/tests/conformance/dom-component-ssr.test.ts) — modes: `server-static`, `production-compile`; observables: `markup`
- [keeps valid inline script characters while preventing closing-tag injection](../packages/octane/tests/conformance/fizz-main-wave4c.test.ts) — modes: `server-string`, `server-stream`, `production-compile`; observables: `markup`
- [keeps raw style text in one element when it contains closing-tag-like tokens](../packages/octane/tests/conformance/fizz-main-wave4c.test.ts) — modes: `server-string`, `server-stream`, `production-compile`; observables: `markup`
- [a $label listener warns at render and reports an Error at dispatch](../packages/octane/tests/conformance/invalid-listeners.test.ts) — modes: `client`, `production-compile`; observables: `events`, `errors`
- [throws for a malformed dangerouslySetInnerHTML value](../packages/octane/tests/conformance/dom-component-children.test.ts) — modes: `client`, `production-compile`; observables: `errors`

**Rationale.** Octane follows React's whole-inline-script escape rather than Redact's exact comment/token spelling, reports invalid listeners instead of silently ignoring them, and rejects malformed raw HTML instead of ignoring extra shapes. The parser/execution containment is covered; byte-level Redact parity is intentionally not claimed.


### hydration

<a id="rdx-hyd-001"></a>

#### RDX-HYD-001 — Suspending hydration recovery must not leak an uncaught mismatch

**Disposition:** critical risk; adaptable; covered; owner: Octane runtime hydration and browser tests.

**Upstream evidence**

- [issue #17](https://github.com/TanStack/redact/issues/17) — Hydration bugs: async-resume mismatch escapes uncaught; head-script claiming; innerHTML probe escaping; foreign-node strictness
- [test: recovers a mismatch when lazy hydration resumes inside Suspense](https://github.com/TanStack/redact/blob/e1620a13aab8935c806238f117ba58559b7cd002/tests/document-hydration.test.tsx#L120-L169) (`tests/document-hydration.test.tsx`)

**Consumer-visible symptom.** A mismatch reached after a lazy hydration suspension reported as recoverable and then escaped through the global error channel, abandoning interaction setup.

**Octane contract.** A client suspension encountered during hydration must converge to exactly one live client arm, report through Octane's chosen hydration channel only, preserve unaffected siblings, and never emit an uncaught error or rejection.

**Applicable modes:** `server-stream`, `hydrate-mismatch`, `deferred-hydration`, `production-compile`, `real-browser`. **Observables:** `markup`, `node-identity`, `events`, `errors`, `streaming`.

**Octane references**

- [packages/octane/tests/conformance/fizz-readiness-hydration.test.ts](../packages/octane/tests/conformance/fizz-readiness-hydration.test.ts) — “reports eager pending-arm recovery instead of deferring a streamed-boundary mismatch” — Proves one final client arm, one expected diagnostic, and identity plus continued interactivity of a stateful sibling outside the recovered boundary.
- [packages/octane/tests/browser/suspense-hydration/suspense-hydration.test.ts](../packages/octane/tests/browser/suspense-hydration/suspense-hydration.test.ts) — “contains async hydration recovery and preserves an interactive outside sibling” — Captures browser error and unhandled-rejection channels before hydration and exercises the streamed reveal script in Chromium.
- [packages/octane/src/runtime.ts](../packages/octane/src/runtime.ts) — `hideTryContentAndMountPending`

**Executable evidence**

- [reports eager pending-arm recovery instead of deferring a streamed-boundary mismatch](../packages/octane/tests/conformance/fizz-readiness-hydration.test.ts) — modes: `server-stream`, `hydrate-mismatch`, `deferred-hydration`, `production-compile`; observables: `markup`, `node-identity`, `events`, `errors`, `streaming`
- [contains async hydration recovery and preserves an interactive outside sibling](../packages/octane/tests/browser/suspense-hydration/suspense-hydration.test.ts) — modes: `server-stream`, `hydrate-mismatch`, `deferred-hydration`, `real-browser`; observables: `markup`, `node-identity`, `events`, `errors`, `streaming`

**Rationale.** Issue #17 remained open when captured, but Redact main commit e1620a13aab8935c806238f117ba58559b7cd002 contains the matching fix and regression, so the resolution is inferred rather than administratively confirmed. Octane eagerly leaves synchronous hydration for a fresh client arm, so Redact's resumed-cursor implementation bug does not transfer directly. The transferred risk is covered at Octane's observation boundary by the one-arm, outside-sibling, and real-browser global-error evidence.


### hydration-errors

<a id="rdx-hyd-005"></a>

#### RDX-HYD-005 — Hydration recovery reporting has an explicit public contract

**Disposition:** medium risk; adaptable; decision required; owner: Octane public root API.

**Upstream evidence**

- [issue #17](https://github.com/TanStack/redact/issues/17) — Hydration bugs: async-resume mismatch escapes uncaught; head-script claiming; innerHTML probe escaping; foreign-node strictness
- [commit e1620a13aab8](https://github.com/TanStack/redact/commit/e1620a13aab8935c806238f117ba58559b7cd002) — fix(redact): harden document hydration recovery

**Consumer-visible symptom.** The same hydration failure appeared on both a recoverable callback and the global error channel, making recovery behavior ambiguous to framework integrations.

**Octane contract.** Octane must document whether hydration diagnostics are console-only or root-callback-addressable and ensure every initial, deferred, and streamed recovery path follows that decision exactly once.

**Applicable modes:** `hydrate-match`, `hydrate-mismatch`, `deferred-hydration`, `production-compile`. **Observables:** `errors`.

**Octane references**

- [packages/octane/tests/conformance/hydration-mismatch.test.ts](../packages/octane/tests/conformance/hydration-mismatch.test.ts) — Documents that onRecoverableError is not currently an Octane root option.

**Next action (decision).** Choose and document console-only diagnostics versus recoverable/caught/uncaught root callbacks, including exact deduplication and production behavior, before adding an API.

Targets: `packages/octane/src/runtime.ts`, `docs/ssr.md`.

**Rationale.** Redact's callback surface should not be copied implicitly; frameworks need a deliberate Octane contract if error callbacks become public.


### hydration-recovery

<a id="rdx-hyd-006"></a>

#### RDX-HYD-006 — Mismatch recovery is bounded to the failed ownership scope

**Disposition:** high risk; adaptable; planned; owner: Octane hydration cursor and ownership ranges.

**Upstream evidence**

- [test: root fallback produces one clean client tree for wrong element type](https://github.com/TanStack/redact/blob/e1620a13aab8935c806238f117ba58559b7cd002/tests/hydration-mismatch-recovery.test.tsx#L53-L64) (`tests/hydration-mismatch-recovery.test.tsx`)
- [test: Suspense-scoped extra server node recovery preserves siblings outside the boundary](https://github.com/TanStack/redact/blob/e1620a13aab8935c806238f117ba58559b7cd002/tests/hydration-mismatch-recovery.test.tsx#L183-L208) (`tests/hydration-mismatch-recovery.test.tsx`)
- [test: Suspense-scoped missing server node recovery preserves siblings outside the boundary](https://github.com/TanStack/redact/blob/e1620a13aab8935c806238f117ba58559b7cd002/tests/hydration-mismatch-recovery.test.tsx#L209-L233) (`tests/hydration-mismatch-recovery.test.tsx`)
- [test: Suspense-scoped recovery attaches events to the client-rendered subtree](https://github.com/TanStack/redact/blob/e1620a13aab8935c806238f117ba58559b7cd002/tests/hydration-mismatch-recovery.test.tsx#L234-L260) (`tests/hydration-mismatch-recovery.test.tsx`)
- [test: nearest host recovery preserves siblings outside the failed host subtree](https://github.com/TanStack/redact/blob/e1620a13aab8935c806238f117ba58559b7cd002/tests/hydration-mismatch-recovery.test.tsx#L262-L297) (`tests/hydration-mismatch-recovery.test.tsx`)

**Consumer-visible symptom.** Recovering one mismatched host or Suspense subtree could remount unaffected siblings, abandon the hydration cursor, or leave the regenerated subtree without live handlers.

**Octane contract.** A structural hydration mismatch rebuilds only its owning failed range, preserves the object identity of unaffected siblings outside that range, and installs events on regenerated content.

**Applicable modes:** `hydrate-mismatch`, `production-compile`, `real-browser`. **Observables:** `markup`, `node-identity`, `events`.

**Octane references**

- [packages/octane/tests/conformance/hydration-mismatch.test.ts](../packages/octane/tests/conformance/hydration-mismatch.test.ts) — “hydration continues past a mismatch: the next sibling adopts + is interactive” — Proves final content and sibling interactivity, but does not retain and compare the sibling object across the recovery.
- [packages/octane/tests/hydration/mismatch-structural.test.ts](../packages/octane/tests/hydration/mismatch-structural.test.ts) — “PROD build: @if branch swap rebuilds SILENTLY (recovery is not gated on the dev loc)” — Proves production recovery but not a nearest-host/Suspense containment matrix.

**Next action (test).** For root, nearest-host, and Suspense-scoped structural mismatches, capture outside siblings before hydration and assert the same objects and handlers survive while the failed subtree is regenerated and its handlers become live in development and production.

Targets: `packages/octane/tests/conformance/hydration-mismatch.test.ts`, `packages/octane/tests/browser`.

**Rationale.** Octane recovers ranges in place instead of following Redact's checkpoint stack, so the transferable requirement is the observable containment boundary rather than checkpoint implementation parity.


### memo-scheduling

<a id="rdx-mem-001"></a>

#### RDX-MEM-001 — Memo prop bailouts do not swallow owned updates or revive removed work

**Disposition:** high risk; portable; covered; owner: Octane memo and scheduler.

**Upstream evidence**

- [test: re-renders a memo component when its useSyncExternalStore fires, even with unchanged props](https://github.com/TanStack/redact/blob/e1620a13aab8935c806238f117ba58559b7cd002/tests/memo-state-rerender.test.tsx#L51-L74) (`tests/memo-state-rerender.test.tsx`)
- [test: does not mount DOM when a pending fiber was unmounted between scheduling and flush](https://github.com/TanStack/redact/blob/e1620a13aab8935c806238f117ba58559b7cd002/tests/memo-state-rerender.test.tsx#L131-L180) (`tests/memo-state-rerender.test.tsx`)

**Consumer-visible symptom.** A stable-prop memo gate swallowed the component's own store update, while stale queued work could render after an ancestor removed it.

**Octane contract.** A memoized component processes its own state/store updates without disabling descendant memo bailouts, and pending work beneath a removed ancestor cannot mount new DOM.

**Applicable modes:** `client`, `production-compile`. **Observables:** `markup`, `node-identity`, `effects`.

**Octane references**

- [packages/octane/tests/conformance/memo-bailout.test.ts](../packages/octane/tests/conformance/memo-bailout.test.ts) — “processes an owned external-store update while stable descendants bail out” — The memo owner updates from its own subscription while an unchanged memo descendant retains both render and host identity.
- [packages/octane/tests/conformance/update-reconciliation.test.ts](../packages/octane/tests/conformance/update-reconciliation.test.ts) — “does not commit a memoized store update after its ancestor removes it” — Queues the deeper store update before the ancestor deletion and proves no committed DOM or effect work can publish from the disposed subtree.

**Executable evidence**

- [processes an owned external-store update while stable descendants bail out](../packages/octane/tests/conformance/memo-bailout.test.ts) — modes: `client`, `production-compile`; observables: `markup`, `node-identity`
- [does not commit a memoized store update after its ancestor removes it](../packages/octane/tests/conformance/update-reconciliation.test.ts) — modes: `client`, `production-compile`; observables: `markup`, `effects`

**Rationale.** Octane schedules hook-owned work directly on the owning block rather than re-entering through its parent memo gate. Its shallow-first queue and disposed-block guards then discard deeper work after an ancestor removes that subtree.


### package-resolution

<a id="rdx-pkg-002"></a>

#### RDX-PKG-002 — Packed Vite consumers and supported integration graphs resolve one runtime

**Disposition:** high risk; adaptable; covered; owner: Octane packaging and bundler integrations.

**Upstream evidence**

- [pull request #2](https://github.com/TanStack/redact/pull/2) — refactor!: rename to @tanstack/redact and consolidate into single package
- [pull request #4](https://github.com/TanStack/redact/pull/4) — fix(redact): switch exports to `default` so RSC + other conditions resolve
- [pull request #5](https://github.com/TanStack/redact/pull/5) — fix(redact): scope resolve.alias to client+ssr envs so RSC stays on real React
- [pull request #8](https://github.com/TanStack/redact/pull/8) — Add React DOM edge server aliases
- [pull request #14](https://github.com/TanStack/redact/pull/14) — feat(redact): vinext SSR/hydration compatibility — 0.0.9

**Consumer-visible symptom.** Source-level tests passed while published export conditions or top-level aliases failed in a real framework environment or selected the wrong runtime graph.

**Octane contract.** Outside-workspace consumers built from packed Octane artifacts resolve one runtime through Vite client and SSR graphs; supported Rspack and Rsbuild environment routing is exercised by their integration builds. This does not claim an external packed-consumer lane for every plugin.

**Applicable modes:** `packaged-consumer`, `vite-client`, `vite-ssr`, `rspack`, `rsbuild`, `production-compile`. **Observables:** `package-resolution`, `markup`.

**Octane references**

- [packages/octane/package.json](../packages/octane/package.json) — Published subpaths provide default conditions.
- [scripts/check-package-packs.mjs](../scripts/check-package-packs.mjs) — Packs, installs, resolves, builds, and executes consumers outside the workspace.

**Executable evidence**

- [discovers a parent package and routes raw dependency imports to the SSR runtime](../packages/octane/tests/vite-integration.test.ts) — modes: `vite-ssr`, `production-compile`; observables: `package-resolution`, `markup`
- [builds client and server graphs with maps, raw dependencies, and one target runtime](../packages/rspack-plugin-octane/tests/rspack.test.ts) — modes: `rspack`; observables: `package-resolution`
- [builds routed client/server environments and serves the production SSR handler](../packages/rsbuild-plugin-octane/tests/rsbuild.integration.test.ts) — modes: `rsbuild`, `production-compile`; observables: `package-resolution`, `markup`
- command: `pnpm packages:pack:check` — modes: `packaged-consumer`, `vite-client`, `vite-ssr`, `production-compile`; observables: `package-resolution`, `markup`

**Rationale.** The exact React/RSC aliases are Redact-only. Octane's packed canary proves the external Vite boundary, while Rspack and Rsbuild remain honestly labeled workspace integration evidence rather than external packed coverage.


### performance

<a id="rdx-perf-001"></a>

#### RDX-PERF-001 — Performance claims use real browsers and multiple controlled workloads

**Disposition:** high risk; portable; documented; owner: Octane core engineering.

**Upstream evidence**

- [pull request #6](https://github.com/TanStack/redact/pull/6) — perf(redact): close ~85% of the render-bench gap to React
- [pull request #7](https://github.com/TanStack/redact/pull/7) — perf(redact): four more render-bench wins — now ~18% faster than React

**Consumer-visible symptom.** JSDOM suggested the opposite performance result from real Chrome, and a single workload hid regressions in keyed reorder, mount/unmount, deep trees, or state churn.

**Octane contract.** Framework performance changes require same-machine comparable baselines, semantic controls, real-browser measurement for DOM work, representative workload coverage, and bundle/codegen accounting.

**Applicable modes:** `benchmark`, `real-browser`, `production-compile`. **Observables:** `performance`, `markup`, `node-identity`.

**Octane references**

- [.agents/memories/core-engineering.md](../.agents/memories/core-engineering.md) — Requires relevant baselines and forbids unsupported performance claims.
- [benchmarks/README.md](../benchmarks/README.md) — Defines browser/Node runners, correctness gates, ratios, and workload inventory.

**Rationale.** Octane already follows this discipline. Add or run only the benchmark relevant to a future hot-path change; do not port Redact's optimizations.


### portal-updates

<a id="rdx-port-002"></a>

#### RDX-PORT-002 — A stateful portal descendant resolves its foreign host for owned updates

**Disposition:** high risk; adaptable; planned; owner: Octane portal host resolution.

**Upstream evidence**

- [test: re-renders a Portal descendant when its own state updates (getHostParent on Portal)](https://github.com/TanStack/redact/blob/e1620a13aab8935c806238f117ba58559b7cd002/tests/floating-ui-pattern.test.tsx#L133-L163) (`tests/floating-ui-pattern.test.tsx`)

**Consumer-visible symptom.** A component inside a portal scheduled its own state update, resolved the logical parent as its host, and inserted or replaced DOM outside the portal target.

**Octane contract.** A descendant component rendered inside a portal may own and schedule updates while all of its host mutations remain anchored in the supplied portal target and preserve surrounding target siblings.

**Applicable modes:** `client`, `production-compile`. **Observables:** `markup`, `node-identity`.

**Octane references**

- [packages/octane/tests/portal.test.ts](../packages/octane/tests/portal.test.ts) — “compiles and renders an inline host-element body into the target, updating reactively” — Updates state owned outside the portal, so it does not exercise descendant-owned host resolution.

**Next action (test).** Render a child component with its own useState inside a portal, schedule its update from that child, and assert the same target and unaffected target siblings retain identity while only the child's host content changes in development and production compile modes.

Targets: `packages/octane/tests/portal.test.ts`.


### portals

<a id="rdx-port-001"></a>

#### RDX-PORT-001 — Portal content mounts in its target and cleans up with its owner

**Disposition:** high risk; portable; covered; owner: Octane portals and UI bindings.

**Upstream evidence**

- [test: mounts portal children into the supplied container](https://github.com/TanStack/redact/blob/e1620a13aab8935c806238f117ba58559b7cd002/tests/portal-doctype.test.tsx#L32-L59) (`tests/portal-doctype.test.tsx`)
- [test: unmounts portal children when the parent stops rendering them](https://github.com/TanStack/redact/blob/e1620a13aab8935c806238f117ba58559b7cd002/tests/portal-doctype.test.tsx#L61-L81) (`tests/portal-doctype.test.tsx`)
- [test: renders portal alongside sibling elements correctly](https://github.com/TanStack/redact/blob/e1620a13aab8935c806238f117ba58559b7cd002/tests/portal-doctype.test.tsx#L83-L113) (`tests/portal-doctype.test.tsx`)

**Consumer-visible symptom.** Portal content mounted outside its supplied target or remained there after the logical owner stopped rendering it.

**Octane contract.** Portal content mounts in the supplied foreign target, and closing or unmounting its logical owner removes that content.

**Applicable modes:** `client`, `production-compile`. **Observables:** `markup`.

**Octane references**

- [packages/octane/tests/portal.test.ts](../packages/octane/tests/portal.test.ts) — “compiles and renders an inline host-element body into the target, updating reactively”

**Executable evidence**

- [compiles and renders an inline host-element body into the target, updating reactively](../packages/octane/tests/portal.test.ts) — modes: `client`, `production-compile`; observables: `markup`
- [unmounts portal content when the if-branch closes](../packages/octane/tests/portal.test.ts) — modes: `client`, `production-compile`; observables: `markup`


### public-exports

<a id="rdx-pkg-001"></a>

#### RDX-PKG-001 — Advertised named exports are locked at the consumer boundary

**Disposition:** medium risk; portable; covered; owner: Octane package surface.

**Upstream evidence**

- [pull request #2](https://github.com/TanStack/redact/pull/2) — refactor!: rename to @tanstack/redact and consolidate into single package
- [test: exposes hooks needed by use-sync-external-store/shim/* aliases](https://github.com/TanStack/redact/blob/e1620a13aab8935c806238f117ba58559b7cd002/tests/public-exports.test.ts#L170-L180) (`tests/public-exports.test.ts`)

**Consumer-visible symptom.** A hook existed in source but was omitted from the package entrypoint, producing a link-time failure only in a downstream consumer.

**Octane contract.** Every intended value export for each public Octane subpath is checked from the built or packed artifact, so removing a re-export is an explicit review event rather than a downstream surprise.

**Applicable modes:** `packaged-consumer`, `production-compile`. **Observables:** `package-resolution`.

**Octane references**

- [packages/octane/scripts/verify-dist.mjs](../packages/octane/scripts/verify-dist.mjs) — `REQUIRED_PUBLIC_VALUE_EXPORTS` — Defines a required subset for every published JavaScript namespace; additions remain compatible while removals fail the prepack build.
- [scripts/check-package-packs.mjs](../scripts/check-package-packs.mjs) — Builds an isolated packed consumer that imports the JSX type-runtime and TSRX helper subpaths.

**Executable evidence**

- [requires committed names while permitting additive exports](../packages/octane/tests/public-exports.test.ts) — modes: `production-compile`; observables: `package-resolution`
- [publishes every subpath advertised to source consumers](../packages/octane/tests/public-exports.test.ts) — modes: `production-compile`, `packaged-consumer`; observables: `package-resolution`
- command: `pnpm packages:pack:check` — modes: `packaged-consumer`, `production-compile`; observables: `package-resolution`

**Rationale.** The audit found four source-advertised subpaths missing from the packed manifest. The package now publishes them, typechecks all four from an outside-workspace tarball consumer, executes the two value-bearing TSRX helpers there, and locks every JavaScript subpath to an additive-friendly required export subset.


### raw-text-hydration

<a id="rdx-hyd-003"></a>

#### RDX-HYD-003 — Raw script and style hydration must use their parsing contexts

**Disposition:** high risk; portable; planned; owner: Octane DOM hydration and SSR serialization.

**Upstream evidence**

- [issue #17](https://github.com/TanStack/redact/issues/17) — Hydration bugs: async-resume mismatch escapes uncaught; head-script claiming; innerHTML probe escaping; foreign-node strictness
- [test: hydrates matching raw script content without HTML normalization](https://github.com/TanStack/redact/blob/e1620a13aab8935c806238f117ba58559b7cd002/tests/document-hydration.test.tsx#L208-L223) (`tests/document-hydration.test.tsx`)

**Consumer-visible symptom.** Byte-equivalent script or style text containing ampersands or less-than signs was parsed through a generic div and falsely reported as mismatched.

**Octane contract.** Hydration comparison must respect script-data and style raw-text parsing, preserve node identity for equivalent server bytes, avoid false diagnostics, and remain safe against closing-tag injection.

**Applicable modes:** `server-string`, `server-stream`, `hydrate-match`, `production-compile`, `real-browser`. **Observables:** `markup`, `node-identity`, `errors`.

**Octane references**

- [packages/octane/src/runtime.ts](../packages/octane/src/runtime.ts) — `setHTML` — Script uses textContent; other hosts use a same-tag contextual probe.
- [packages/octane/tests/script-innerhtml.test.ts](../packages/octane/tests/script-innerhtml.test.ts) — “hydrates the server-safe script spelling by adoption and applies later updates” — Script coverage is already strong.
- [packages/octane/tests/conformance/fizz-main-wave4c.test.ts](../packages/octane/tests/conformance/fizz-main-wave4c.test.ts) — “keeps raw style text in one element when it contains closing-tag-like tokens” — Current style evidence is server-only.

**Next action (test).** Add server-render, parse, hydrate, and update coverage for raw style text containing &amp;&amp;, &lt;, entity-like text, and closing-tag-like tokens; assert adoption and no warning in the unit lane, then use Chromium/CSSOM to prove intact stylesheet semantics.

Targets: `packages/octane/tests/script-innerhtml.test.ts`, `packages/octane/tests/browser`.

**Rationale.** The Redact script failure is already prevented; the remaining gap is direct hydration evidence for style's distinct raw-text and SSR-escape behavior.


### reconciliation

<a id="rdx-rec-001"></a>

#### RDX-REC-001 — Keyed reorders preserve survivor identity and final order

**Disposition:** high risk; adaptable; covered; owner: Octane reconciler.

**Upstream evidence**

- [test: reorders keyed list items preserving DOM identity](https://github.com/TanStack/redact/blob/e1620a13aab8935c806238f117ba58559b7cd002/tests/child-reorder.test.tsx#L95-L128) (`tests/child-reorder.test.tsx`)

**Consumer-visible symptom.** A keyed reorder produced the right text but recreated survivor DOM nodes or left them in the wrong final order.

**Octane contract.** Keyed survivors retain object identity and reach the requested final order; Octane's LIS-selected physical move set need not match React or Redact.

**Applicable modes:** `client`, `production-compile`. **Observables:** `markup`, `node-identity`.

**Octane references**

- [packages/octane/tests/conformance/multichild-identity.test.ts](../packages/octane/tests/conformance/multichild-identity.test.ts) — “reverse preserves all instances (pure moves)”
- [packages/octane/tests/conformance/fuzz-keyed-list.test.ts](../packages/octane/tests/conformance/fuzz-keyed-list.test.ts) — Exercises prefix, tail, small-displacement, and LIS paths across deterministic mutation streams.

**Executable evidence**

- [reverse preserves all instances (pure moves)](../packages/octane/tests/conformance/multichild-identity.test.ts) — modes: `client`, `production-compile`; observables: `markup`, `node-identity`
- [inserting in the middle preserves existing instances](../packages/octane/tests/conformance/multichild-identity.test.ts) — modes: `client`, `production-compile`; observables: `markup`, `node-identity`

**Rationale.** Physical move-sequence parity is intentionally excluded because Octane's LIS reconciler promises final order and survivor identity with fewer moves.


### reconciliation-placement

<a id="rdx-rec-002"></a>

#### RDX-REC-002 — Topology transitions use the correct absolute anchor without stable reattachment

**Disposition:** high risk; adaptable; planned; owner: Octane reconciler and portal placement.

**Upstream evidence**

- [test: Sidebar Portal→div via Provider cascade: new div lands BEFORE chat](https://github.com/TanStack/redact/blob/e1620a13aab8935c806238f117ba58559b7cd002/tests/place-children-anchor.test.tsx#L31-L99) (`tests/place-children-anchor.test.tsx`)
- [test: first child swaps Portal→div with multiple later siblings](https://github.com/TanStack/redact/blob/e1620a13aab8935c806238f117ba58559b7cd002/tests/place-children-anchor.test.tsx#L101-L158) (`tests/place-children-anchor.test.tsx`)
- [test: first child goes null→div via Provider cascade: new div at index 0](https://github.com/TanStack/redact/blob/e1620a13aab8935c806238f117ba58559b7cd002/tests/place-children-anchor.test.tsx#L160-L202) (`tests/place-children-anchor.test.tsx`)
- [test: stable re-render does not reorder stable DOM](https://github.com/TanStack/redact/blob/e1620a13aab8935c806238f117ba58559b7cd002/tests/place-children-anchor.test.tsx#L204-L242) (`tests/place-children-anchor.test.tsx`)

**Consumer-visible symptom.** A Portal-to-element or null-to-element transition inserted new output after the wrong sibling, while a no-op rerender could detach and reinsert otherwise stable DOM.

**Octane contract.** When a child changes topology, each newly materialized range lands at its absolute logical anchor around portal and ordinary siblings; a stable rerender emits no child-list mutations and preserves every existing host object.

**Applicable modes:** `client`, `production-compile`, `real-browser`. **Observables:** `markup`, `node-identity`, `dom-mutations`.

**Octane references**

- [packages/octane/tests/differential/anchor-order.test.ts](../packages/octane/tests/differential/anchor-order.test.ts) — Covers final source order across control-flow transitions, but differential HTML cannot see host reattachment and has no portal topology case.
- [packages/octane/tests/portal.test.ts](../packages/octane/tests/portal.test.ts) — “unmounts portal content when the if-branch closes” — Covers removal/recreation, not Portal→ordinary replacement around stable siblings.

**Next action (test).** Port Portal→element and null→element first-child transitions with multiple stable later siblings; retain every survivor object, assert exact final order, and use MutationObserver in Chromium to prove a stable rerender produces no child-list records.

Targets: `packages/octane/tests/portal.test.ts`, `packages/octane/tests/browser`.

**Rationale.** The existing keyed identity suite proves a different reconciler contract. Redact's topology cases require portal-aware absolute placement plus a mutation-level oracle, so they remain an explicit gap instead of being hidden under RDX-REC-001.


### redact-specific-surfaces

<a id="rdx-non-001"></a>

#### RDX-NON-001 — React package shims, RSC internals, and private debug names are not Octane targets

**Disposition:** low risk; non goal; documented; owner: Octane architecture.

**Upstream evidence**

- [pull request #5](https://github.com/TanStack/redact/pull/5) — fix(redact): scope resolve.alias to client+ssr envs so RSC stays on real React
- [pull request #8](https://github.com/TanStack/redact/pull/8) — Add React DOM edge server aliases
- [pull request #11](https://github.com/TanStack/redact/pull/11) — Expose ReactDOM Flight hint internals
- [pull request #12](https://github.com/TanStack/redact/pull/12) — chore(redact/hydration): rename internal '__tdom*' scroll-guard globals to '__redact*'
- [pull request #14](https://github.com/TanStack/redact/pull/14) — feat(redact): vinext SSR/hydration compatibility — 0.0.9

**Consumer-visible symptom.** Redact needed compatibility with React package names, Flight private internals, RSC environment routing, and legacy internal global names.

**Octane contract.** Octane remains responsible for its public runtime, compiler, SSR, hydration, and documented bundler integrations, not for impersonating React private package or Flight surfaces.

**Applicable modes:** `vite-client`, `vite-ssr`, `packaged-consumer`. **Observables:** `package-resolution`.

**Octane references**

- [docs/differences-from-react.md](../docs/differences-from-react.md) — Records unsupported React-only surfaces.

**Rationale.** Class components, forwardRef, Server Components/Flight, React package aliases, Redact's renderer registry, and private debug globals are architecture-specific exclusions. Portable packaging or SSR lessons are tracked separately.


### refs

<a id="rdx-ref-001"></a>

#### RDX-REF-001 — Callback refs run in commit order and clean up exactly once

**Disposition:** high risk; portable; covered; owner: Octane refs and commit phase.

**Upstream evidence**

- [test: does not invoke a callback ref during render](https://github.com/TanStack/redact/blob/e1620a13aab8935c806238f117ba58559b7cd002/tests/callback-ref-commit-phase.test.tsx#L33-L65) (`tests/callback-ref-commit-phase.test.tsx`)
- [test: runs the cleanup ref(null) on unmount](https://github.com/TanStack/redact/blob/e1620a13aab8935c806238f117ba58559b7cd002/tests/callback-ref-commit-phase.test.tsx#L67-L85) (`tests/callback-ref-commit-phase.test.tsx`)
- [test: runs the user-provided cleanup function returned from a callback ref](https://github.com/TanStack/redact/blob/e1620a13aab8935c806238f117ba58559b7cd002/tests/callback-ref-commit-phase.test.tsx#L87-L113) (`tests/callback-ref-commit-phase.test.tsx`)

**Consumer-visible symptom.** A callback ref fired during render or received both its returned cleanup and a redundant null detach call.

**Octane contract.** Refs attach only after connected DOM exists, precede layout-effect bodies, detach in the documented commit order, and use either cleanup-return or legacy null notification exactly once.

**Applicable modes:** `client`, `production-compile`. **Observables:** `refs`, `effects`.

**Octane references**

- [packages/octane/tests/ref-timing.test.ts](../packages/octane/tests/ref-timing.test.ts) — “ref attaches before the layout effect body (mount), layout cleanup before ref detach (unmount)”
- [packages/octane/tests/conformance/refs.test.ts](../packages/octane/tests/conformance/refs.test.ts) — “handles detaching refs with either cleanup function or null argument”

**Executable evidence**

- [a callback ref fires with a node already connected to the document](../packages/octane/tests/ref-timing.test.ts) — modes: `client`, `production-compile`; observables: `refs`
- [ref attaches before the layout effect body (mount), layout cleanup before ref detach (unmount)](../packages/octane/tests/ref-timing.test.ts) — modes: `client`, `production-compile`; observables: `refs`, `effects`
- [handles detaching refs with either cleanup function or null argument](../packages/octane/tests/conformance/refs.test.ts) — modes: `client`, `production-compile`; observables: `refs`


### root-ownership

<a id="rdx-hyd-004"></a>

#### RDX-HYD-004 — Foreign document nodes do not weaken ordinary element-root ownership

**Disposition:** medium risk; non goal; documented; owner: Octane root API and metaframework integrations.

**Upstream evidence**

- [issue #17](https://github.com/TanStack/redact/issues/17) — Hydration bugs: async-resume mismatch escapes uncaught; head-script claiming; innerHTML probe escaping; foreign-node strictness
- [pull request #10](https://github.com/TanStack/redact/pull/10) — Project document head elements
- [test: preserves foreign nodes after expected document body children](https://github.com/TanStack/redact/blob/e1620a13aab8935c806238f117ba58559b7cd002/tests/document-hydration.test.tsx#L87-L118) (`tests/document-hydration.test.tsx`)

**Consumer-visible symptom.** A hidden iframe injected at the open document boundary caused whole-document hydration to fail, even though it was not application-owned content.

**Octane contract.** The element passed to hydrateRoot remains strictly owned: ordinary unclaimed content inside it is diagnosed and removed, while ordinary nodes outside it are untouched. Explicit portal targets and compiler-owned head hoists follow their own ownership contracts. Document/body tolerance requires a separate explicit API and ownership decision.

**Applicable modes:** `hydrate-mismatch`, `real-browser`. **Observables:** `markup`, `node-identity`, `errors`.

**Octane references**

- [packages/octane/src/runtime.ts](../packages/octane/src/runtime.ts) — `finishRoot` — Intentionally diagnoses and removes unclaimed root siblings.
- [packages/octane/tests/conformance/hydration-mismatch.test.ts](../packages/octane/tests/conformance/hydration-mismatch.test.ts) — “server renders an extra element the client omits (Per :834)”

**Rationale.** Octane hydrates a supplied Element rather than Document. Redact's body-level tolerance must not become blanket permissiveness inside an application-owned container. Revisit only if Octane introduces document/body hydration.

<a id="rdx-root-001"></a>

#### RDX-ROOT-001 — The first root render clears foreign children exactly once

**Disposition:** high risk; portable; covered; owner: Octane root lifecycle.

**Upstream evidence**

- [test: clears pre-existing children on the first render](https://github.com/TanStack/redact/blob/e1620a13aab8935c806238f117ba58559b7cd002/tests/create-root-clear-container.test.tsx#L27-L37) (`tests/create-root-clear-container.test.tsx`)
- [test: does not re-clear on subsequent renders (preserves reconciled DOM)](https://github.com/TanStack/redact/blob/e1620a13aab8935c806238f117ba58559b7cd002/tests/create-root-clear-container.test.tsx#L39-L55) (`tests/create-root-clear-container.test.tsx`)

**Consumer-visible symptom.** A root either left stale foreign children in its managed container or cleared the entire container again on an update, destroying reconciled host identity.

**Octane contract.** The first createRoot render removes pre-existing unowned children before mounting the client tree; later renders reconcile that managed tree without clearing the container and preserve stable host objects.

**Applicable modes:** `client`, `production-compile`. **Observables:** `markup`, `node-identity`.

**Octane references**

- [packages/octane/tests/conformance/root-semantics.test.ts](../packages/octane/tests/conformance/root-semantics.test.ts) — “clears existing children”
- [packages/octane/tests/conformance/root-semantics.test.ts](../packages/octane/tests/conformance/root-semantics.test.ts) — “should reuse markup if rendering to the same target twice”

**Executable evidence**

- [clears existing children](../packages/octane/tests/conformance/root-semantics.test.ts) — modes: `client`, `production-compile`; observables: `markup`
- [should reuse markup if rendering to the same target twice](../packages/octane/tests/conformance/root-semantics.test.ts) — modes: `client`, `production-compile`; observables: `markup`, `node-identity`


### ssr-streaming

<a id="rdx-ssr-001"></a>

#### RDX-SSR-001 — SSR retries and render replays are transactional and request-scoped

**Disposition:** critical risk; portable; covered; owner: Octane server renderer and streaming transports.

**Upstream evidence**

- [pull request #9](https://github.com/TanStack/redact/pull/9) — Support vinext SSR stream bootstrap
- [pull request #14](https://github.com/TanStack/redact/pull/14) — feat(redact): vinext SSR/hydration compatibility — 0.0.9
- [test: restores nested providers](https://github.com/TanStack/redact/blob/e1620a13aab8935c806238f117ba58559b7cd002/tests/ssr-context.test.tsx#L52-L83) (`tests/ssr-context.test.tsx`)
- [test: retries when the root render suspends before any boundary](https://github.com/TanStack/redact/blob/e1620a13aab8935c806238f117ba58559b7cd002/tests/ssr.test.tsx#L160-L174) (`tests/ssr.test.tsx`)
- [test: hydrates a resolved boundary against the streamed real content](https://github.com/TanStack/redact/blob/e1620a13aab8935c806238f117ba58559b7cd002/tests/streaming-hydration.test.tsx#L43-L90) (`tests/streaming-hydration.test.tsx`)
- [test: re-hydrates a pending boundary when the server reveal fires](https://github.com/TanStack/redact/blob/e1620a13aab8935c806238f117ba58559b7cd002/tests/streaming-hydration.test.tsx#L92-L157) (`tests/streaming-hydration.test.tsx`)

**Consumer-visible symptom.** A root-level suspension or boundary replay could leak partial chunks, IDs, boundary records, or provider values into the retry or another request.

**Octane contract.** Buffered render replays and streamed retries isolate render state, retire discarded boundary records, preserve provider stacks and stable IDs, hydrate revealed ranges in place, and report terminal root failure once.

**Applicable modes:** `server-string`, `server-static`, `server-stream`, `hydrate-match`. **Observables:** `markup`, `node-identity`, `streaming`, `errors`.

**Octane references**

- [packages/octane/tests/ssr-stream-state-regressions.test.ts](../packages/octane/tests/ssr-stream-state-regressions.test.ts) — Covers discarded passes, stable IDs, retired boundaries, and late errors.
- [packages/octane/tests/streaming-ssr.test.ts](../packages/octane/tests/streaming-ssr.test.ts) — Covers stream/hydration interleavings, reveal replacement, failure reporting, and seed scopes.
- [docs/ssr.md](../docs/ssr.md) — Bootstrap modules/import maps remain a metaframework concern rather than a core renderer option.

**Executable evidence**

- [settled output is byte-identical to a single-pass render of the final state (useId, markers, sibling order)](../packages/octane/tests/ssr-render-phase-state.test.ts) — modes: `server-string`; observables: `markup`
- [rewinds the suspense seed stream — one use() seeds exactly once across the passes](../packages/octane/tests/ssr-render-phase-state.test.ts) — modes: `server-static`; observables: `markup`
- [restores each Provider value across suspended concurrent streams](../packages/octane/tests/conformance/fizz-streaming.test.ts) — modes: `server-stream`; observables: `markup`, `streaming`
- [delivers a boundary that resolves while a bare Promise delays the shell](../packages/octane/tests/conformance/fizz-streaming.test.ts) — modes: `server-stream`; observables: `markup`, `streaming`
- [does not retain a boundary registered by a discarded render-phase pass](../packages/octane/tests/ssr-stream-state-regressions.test.ts) — modes: `server-stream`; observables: `streaming`
- [swaps the segment into place, scopes its seeds, and hydrates byte-for-byte](../packages/octane/tests/streaming-ssr.test.ts) — modes: `server-stream`, `hydrate-match`; observables: `markup`, `node-identity`, `streaming`
- [reports a root failure through the shell callbacks and rejects a readable stream](../packages/octane/tests/conformance/fizz-streaming.test.ts) — modes: `server-stream`; observables: `errors`, `streaming`

**Rationale.** Redact's inline bootstrap API belongs at Octane's plugin/adapter boundary; the portable transactional retry and request-isolation contracts are already strongly covered.


### suspense-preservation

<a id="rdx-sus-001"></a>

#### RDX-SUS-001 — Re-suspension preserves browser-owned state in committed UI

**Disposition:** critical risk; adaptable; covered; owner: Octane Suspense runtime and browser tests.

**Upstream evidence**

- [pull request #16](https://github.com/TanStack/redact/pull/16) — fix(redact): preserve committed DOM across Suspense re-suspension
- [test: keeps the same scrollable DOM node when Suspense suspends after initial commit](https://github.com/TanStack/redact/blob/e1620a13aab8935c806238f117ba58559b7cd002/tests/suspense-preserves-dom.test.tsx#L29-L102) (`tests/suspense-preserves-dom.test.tsx`)
- [test: preserves a sibling scrollable when the swapped-in child suspends](https://github.com/TanStack/redact/blob/e1620a13aab8935c806238f117ba58559b7cd002/tests/suspense-preserves-dom.test.tsx#L108-L167) (`tests/suspense-preserves-dom.test.tsx`)
- [test: preserves focus on an input across a sibling suspension](https://github.com/TanStack/redact/blob/e1620a13aab8935c806238f117ba58559b7cd002/tests/suspense-preserves-dom.test.tsx#L170-L220) (`tests/suspense-preserves-dom.test.tsx`)

**Consumer-visible symptom.** Navigating through a suspension detached committed hosts, resetting scroll and DOM Range anchors even though the logical UI and host objects survived.

**Octane contract.** Once primary content has committed, a fallback-visible re-suspension keeps its host tree connected but visually hidden. Replacement work is proven before the prior committed range is destroyed across control-flow, component, value-child, and returned-output slots, and reentrant deletion cannot resurrect discarded work. Stable hosts, component state, uncontrolled values, input selection offsets, DOM Range anchors, and scroll offsets survive reveal. Focus remains browser-managed rather than being explicitly blurred or restored; a transition that continues showing prior content retains focus. Refs and layout effects detach or clean up once on hide and reattach or recreate in source order on reveal; passive effects remain connected until actual deletion.

**Applicable modes:** `client`, `production-compile`, `real-browser`. **Observables:** `markup`, `node-identity`, `dom-mutations`, `focus`, `selection`, `scroll`, `live-properties`, `effects`, `refs`, `errors`.

**Octane references**

- [packages/octane/src/runtime.ts](../packages/octane/src/runtime.ts) — `hideTryBlock` — Keeps primary hosts connected, hides logical portal ranges, preserves authored display state, and composes nested hidden ownership.
- [packages/octane/tests/suspense-preserves-dom.test.ts](../packages/octane/tests/suspense-preserves-dom.test.ts) — “keeps same-tree primary hosts connected and restores authored display/text” — A companion covers a route-swap tree; the file also covers portals, direct text, nested ownership, and hidden unmount cleanup in development and production compilation.
- [packages/octane/tests/suspense-preserves-dom.test.ts](../packages/octane/tests/suspense-preserves-dom.test.ts) — “reconnects memoized effects at their source position without re-running the body” — Proves reveal reconnects a bailed memo descendant in source order without defeating memo semantics.
- [packages/octane/tests/suspense-preserves-dom.test.ts](../packages/octane/tests/suspense-preserves-dom.test.ts) — “reconnects memo-bailed effects in declaration order after staggered updates” — Prevents historical changed-dependency commit time from reordering effect recreation on reveal.
- [packages/octane/tests/suspense-preserves-dom.test.ts](../packages/octane/tests/suspense-preserves-dom.test.ts) — “keeps passive effects connected across hide and reveal” — Distinguishes passive subscriptions, which remain live while content is hidden, from layout effects, which disconnect and reconnect.
- [packages/octane/tests/suspense-preserves-dom.test.ts](../packages/octane/tests/suspense-preserves-dom.test.ts) — “does not detach a hidden primary ref again when its retry enters catch” — A React-19 callback-ref cleanup fires exactly once when fallback-visible work rejects into the terminal catch arm.
- [packages/octane/tests/suspense-preserves-dom.test.ts](../packages/octane/tests/suspense-preserves-dom.test.ts) — “does not suppress ref teardown in an independent root during hidden cleanup” — Ref-detach suppression is scoped to exact hidden hosts, so reentrant cleanup still detaches unrelated roots normally.
- [packages/octane/tests/suspense-preserves-dom.test.ts](../packages/octane/tests/suspense-preserves-dom.test.ts) — “never detaches a completed child from an aborted parent mount” — Exact-host suppression spans recursive teardown so a child whose attach never committed cannot receive a manufactured detach.
- [packages/octane/tests/suspense-preserves-dom.test.ts](../packages/octane/tests/suspense-preserves-dom.test.ts) — “stops a reveal when fallback cleanup unmounts the owning root” — A reentrant root deletion during fallback cleanup prevents the prepared primary and captured lifecycle from publishing.
- [packages/octane/tests/suspense-preserves-dom.test.ts](../packages/octane/tests/suspense-preserves-dom.test.ts) — “stops a catch commit when primary cleanup unmounts the owning root” — Terminal error routing cannot insert a catch arm after cleanup disposes the boundary.
- [packages/octane/tests/suspense-preserves-dom.test.ts](../packages/octane/tests/suspense-preserves-dom.test.ts) — “keeps a superseding markerless branch inside the preserved try range” — A partial first arm is swept before a fulfilled superseding arm mounts, and stale settlement cannot mutate the live branch.
- [packages/octane/tests/suspense-preserves-dom.test.ts](../packages/octane/tests/suspense-preserves-dom.test.ts) — “preserves an urgent componentSlot replacement that suspends” — Companion cases cover value-child and returned-output kind replacements so urgent preservation is not limited to @if branches.
- [packages/octane/tests/suspense-preserves-dom.test.ts](../packages/octane/tests/suspense-preserves-dom.test.ts) — “does not commit an urgent WIP after old-branch cleanup unmounts the root” — Publishes completed replacement ownership before invoking old-tree user cleanup and proves reentrant root deletion cannot resurrect it.
- [packages/octane/tests/suspense-preserves-dom.test.ts](../packages/octane/tests/suspense-preserves-dom.test.ts) — “does not commit a transition component WIP after old cleanup unmounts the root” — A value-child companion covers the separate range-move path; neither captured lifecycle nor detached WIP DOM can publish after reentrant deletion.
- [packages/octane/tests/browser/suspense-hydration/suspense-hydration.test.ts](../packages/octane/tests/browser/suspense-hydration/suspense-hydration.test.ts) — “preserves same-tree browser state through an urgent fallback” — Chromium observes connectivity, visibility, state, uncontrolled value, input selection, focus, scroll, refs, effects, and subscriptions; a route-swap companion covers the second structure.
- [packages/octane/tests/browser/suspense-hydration/suspense-hydration.test.ts](../packages/octane/tests/browser/suspense-hydration/suspense-hydration.test.ts) — “pins React 19.2.7 focus behavior for fallback-visible primary content” — A React DOM reference case in the same Chromium harness proves the hidden primary remains connected and that React does not automatically restore focus after reveal.
- [packages/octane/tests/browser/suspense-hydration/suspense-hydration.test.ts](../packages/octane/tests/browser/suspense-hydration/suspense-hydration.test.ts) — “keeps a direct-root boundary empty when ref detach synchronously unmounts it” — Covers reentrant user code during ref cycling and proves a late thenable cannot resurrect disposed fallback state.
- [packages/octane/tests/conformance/suspense-refs.test.ts](../packages/octane/tests/conformance/suspense-refs.test.ts) — “detaches host refs on suspend and re-attaches on reveal” — Proves reuse of the same node, not browser focus/scroll preservation.
- [packages/octane/tests/conformance/suspense-effects-semantics.test.ts](../packages/octane/tests/conformance/suspense-effects-semantics.test.ts) — “destroys the committed layout effect on re-suspend, recreates on reveal”
- [packages/octane/tests/universal-renderer.test.ts](../packages/octane/tests/universal-renderer.test.ts) — “retains suspended ownership for retry and tears it down when the retry errors” — Universal host ownership survives a DOM fallback retry but is permanently released when that retained retry errors; companion boundary coverage proves an abandoned initial suspension leaves an uncommitted root reusable.

**Executable evidence**

- [keeps same-tree primary hosts connected and restores authored display/text](../packages/octane/tests/suspense-preserves-dom.test.ts) — modes: `client`, `production-compile`; observables: `markup`, `node-identity`, `dom-mutations`, `live-properties`
- [keeps swap-tree primary hosts connected and restores authored display/text](../packages/octane/tests/suspense-preserves-dom.test.ts) — modes: `client`, `production-compile`; observables: `markup`, `node-identity`, `dom-mutations`, `live-properties`
- [cycles portal lifecycle once and fully tears a hidden primary down](../packages/octane/tests/suspense-preserves-dom.test.ts) — modes: `client`, `production-compile`; observables: `markup`, `effects`, `refs`
- [keeps a nested portal hidden when the inner boundary resolves first](../packages/octane/tests/suspense-preserves-dom.test.ts) — modes: `client`, `production-compile`; observables: `markup`, `node-identity`, `dom-mutations`
- [reconnects memoized effects at their source position without re-running the body](../packages/octane/tests/suspense-preserves-dom.test.ts) — modes: `client`, `production-compile`; observables: `effects`
- [reconnects memo-bailed effects in declaration order after staggered updates](../packages/octane/tests/suspense-preserves-dom.test.ts) — modes: `client`, `production-compile`; observables: `effects`
- [keeps passive effects connected across hide and reveal](../packages/octane/tests/suspense-preserves-dom.test.ts) — modes: `client`, `production-compile`; observables: `effects`
- [does not detach a hidden primary ref again when its retry enters catch](../packages/octane/tests/suspense-preserves-dom.test.ts) — modes: `client`, `production-compile`; observables: `markup`, `refs`, `errors`
- [does not suppress ref teardown in an independent root during hidden cleanup](../packages/octane/tests/suspense-preserves-dom.test.ts) — modes: `client`, `production-compile`; observables: `refs`, `effects`, `errors`
- [never detaches a completed child from an aborted parent mount](../packages/octane/tests/suspense-preserves-dom.test.ts) — modes: `client`, `production-compile`; observables: `refs`, `errors`
- [stops a reveal when fallback cleanup unmounts the owning root](../packages/octane/tests/suspense-preserves-dom.test.ts) — modes: `client`, `production-compile`; observables: `markup`, `effects`, `errors`
- [stops a catch commit when primary cleanup unmounts the owning root](../packages/octane/tests/suspense-preserves-dom.test.ts) — modes: `client`, `production-compile`; observables: `markup`, `effects`, `errors`
- [keeps a superseding markerless branch inside the preserved try range](../packages/octane/tests/suspense-preserves-dom.test.ts) — modes: `client`, `production-compile`; observables: `markup`, `node-identity`, `dom-mutations`
- [preserves an urgent componentSlot replacement that suspends](../packages/octane/tests/suspense-preserves-dom.test.ts) — modes: `client`, `production-compile`; observables: `markup`, `node-identity`, `dom-mutations`
- [preserves an urgent childSlot replacement that suspends](../packages/octane/tests/suspense-preserves-dom.test.ts) — modes: `client`, `production-compile`; observables: `markup`, `node-identity`, `dom-mutations`
- [preserves an urgent return-slot kind replacement that suspends](../packages/octane/tests/suspense-preserves-dom.test.ts) — modes: `client`, `production-compile`; observables: `markup`, `node-identity`, `dom-mutations`
- [does not commit an urgent WIP after old-branch cleanup unmounts the root](../packages/octane/tests/suspense-preserves-dom.test.ts) — modes: `client`, `production-compile`; observables: `markup`, `refs`, `effects`, `errors`
- [does not commit a transition component WIP after old cleanup unmounts the root](../packages/octane/tests/suspense-preserves-dom.test.ts) — modes: `client`, `production-compile`; observables: `markup`, `refs`, `effects`, `errors`
- [does not commit a transition child WIP after old cleanup unmounts the root](../packages/octane/tests/suspense-preserves-dom.test.ts) — modes: `client`, `production-compile`; observables: `markup`, `refs`, `effects`, `errors`
- [pins React 19.2.7 focus behavior for fallback-visible primary content](../packages/octane/tests/browser/suspense-hydration/suspense-hydration.test.ts) — modes: `client`, `real-browser`; observables: `node-identity`, `focus`, `errors`
- [preserves same-tree browser state through an urgent fallback](../packages/octane/tests/browser/suspense-hydration/suspense-hydration.test.ts) — modes: `client`, `real-browser`; observables: `node-identity`, `focus`, `selection`, `scroll`, `live-properties`, `effects`, `refs`, `errors`
- [preserves swap-tree browser state through an urgent fallback](../packages/octane/tests/browser/suspense-hydration/suspense-hydration.test.ts) — modes: `client`, `real-browser`; observables: `node-identity`, `focus`, `selection`, `scroll`, `live-properties`, `effects`, `refs`, `errors`
- [preserves a DOM Range anchor through a fallback-visible route swap](../packages/octane/tests/browser/suspense-hydration/suspense-hydration.test.ts) — modes: `client`, `real-browser`; observables: `node-identity`, `selection`, `scroll`, `errors`
- [keeps browser state live when a transition resolves before fallback](../packages/octane/tests/browser/suspense-hydration/suspense-hydration.test.ts) — modes: `client`, `real-browser`; observables: `node-identity`, `focus`, `selection`, `scroll`, `live-properties`, `effects`, `refs`, `errors`
- [preserves browser state when a transition crosses its fallback timeout](../packages/octane/tests/browser/suspense-hydration/suspense-hydration.test.ts) — modes: `client`, `real-browser`; observables: `node-identity`, `focus`, `selection`, `scroll`, `live-properties`, `errors`
- [keeps a direct-root boundary empty when ref detach synchronously unmounts it](../packages/octane/tests/browser/suspense-hydration/suspense-hydration.test.ts) — modes: `client`, `real-browser`; observables: `markup`, `node-identity`, `refs`, `errors`
- [detaches host refs on suspend and re-attaches on reveal](../packages/octane/tests/conformance/suspense-refs.test.ts) — modes: `client`, `production-compile`; observables: `node-identity`, `refs`
- [destroys the committed layout effect on re-suspend, recreates on reveal](../packages/octane/tests/conformance/suspense-effects-semantics.test.ts) — modes: `client`, `production-compile`; observables: `effects`
- [retains suspended ownership for retry and tears it down when the retry errors](../packages/octane/tests/universal-renderer.test.ts) — modes: `client`, `production-compile`; observables: `errors`

**Rationale.** The preservation outcome transfers, but Redact's implementation and jsdom-only focus assertion do not. A committed React 19.2.7 Chromium reference case shows the primary stays connected while hidden and that React does not automatically restore focus after reveal; the exact moment Chromium normalizes focus is deliberately not part of the contract. Octane likewise leaves focus browser-managed and promises no automatic refocus. Transitions that resolve before a fallback appears retain focus and do not cycle refs or effects.


### use-id

<a id="rdx-id-001"></a>

#### RDX-ID-001 — Each root owns a deterministic useId sequence

**Disposition:** high risk; portable; covered; owner: Octane root and SSR identity.

**Upstream evidence**

- [commit e1620a13aab8](https://github.com/TanStack/redact/commit/e1620a13aab8935c806238f117ba58559b7cd002) — fix(redact): harden document hydration recovery
- [test: starts hydrated useId sequences from each server-rendered root](https://github.com/TanStack/redact/blob/e1620a13aab8935c806238f117ba58559b7cd002/tests/hydration.test.tsx#L232-L266) (`tests/hydration.test.tsx`)

**Consumer-visible symptom.** A prior root's allocations shifted the next root's hydrated IDs away from the server sequence.

**Octane contract.** Sibling client roots are independently namespaced, server IDs hydrate byte-for-byte, and explicit identifier prefixes compose with root-local allocation.

**Applicable modes:** `client`, `server-string`, `server-stream`, `hydrate-match`, `production-compile`. **Observables:** `markup`, `node-identity`.

**Octane references**

- [packages/octane/tests/conformance/useid-determinism.test.ts](../packages/octane/tests/conformance/useid-determinism.test.ts) — “automatically namespaces sibling createRoot roots”
- [packages/octane/tests/conformance/useid-determinism.test.ts](../packages/octane/tests/conformance/useid-determinism.test.ts) — “starts hydrated useId sequences from each server-rendered root”

**Executable evidence**

- [automatically namespaces sibling createRoot roots](../packages/octane/tests/conformance/useid-determinism.test.ts) — modes: `client`, `production-compile`; observables: `markup`
- [starts hydrated useId sequences from each server-rendered root](../packages/octane/tests/conformance/useid-determinism.test.ts) — modes: `server-string`, `hydrate-match`, `production-compile`; observables: `markup`, `node-identity`
- [hydrates completed boundary useId values in its opaque stream namespace](../packages/octane/tests/streaming-ssr.test.ts) — modes: `server-stream`, `hydrate-match`, `production-compile`; observables: `markup`, `node-identity`
