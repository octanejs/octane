# Lynx framework contract audit

Recorded against the exact package and SDK set in `toolchain.json` on
2026-07-18. “Typed” means the selected published declaration package exposes
the surface; it does not by itself prove identical behavior on every native
engine. The device gates in `phase-0-evidence.json` remain authoritative.

## Classification

- **Public documented** — described as a framework/application API in the Lynx
  documentation and present in a published package.
- **Public typed** — present in a published Lynx declaration, but the exact
  framework-author lifecycle behavior still needs real-engine evidence.
- **Published low-level** — exported by a published tool package and exercised
  by upstream source/tests, but sensitive to the pinned 0.x toolchain.
- **Injected/private** — installed through ReactLynx-owned or engine injection
  objects and absent from the selected public declaration packages.
- **Unresolved** — the spike has no stable public contract or native execution
  evidence sufficient for a port.

## Contract matrix

| Required surface | Classification | Evidence | Milestone 0 decision |
| --- | --- | --- | --- |
| Create, mutate, inspect parentage, insert, remove, and flush PAPI nodes | Public documented and typed | [Element PAPI for framework authors](https://lynxjs.org/api/engine/element-api); [`__GetParent`](https://lynxjs.org/api/engine/element-api/__getparent) returns the current parent or `undefined`, and [`__ElementIsEqual`](https://lynxjs.org/api/engine/element-api/__elementisequal) compares opaque element references. `@lynx-js/type-element-api/types/element-api.d.ts` declares these alongside `__CreatePage`, `__CreateElement`, `__CreateRawText`, `__AppendElement`, `__SetAttribute`, `__AddDataset`, `__RemoveElement`, and `__FlushElementTree`. | Suitable for the Octane-owned main-thread receiver, subject to native execution. Parent inspection plus opaque-reference equality makes terminal root removal idempotent when a PAPI operation's mutation outcome is ambiguous. |
| Register a native event token | Public documented and typed | [`__AddEvent`](https://lynxjs.org/api/engine/element-api/__addevent) accepts a string listener token; the declaration is in `@lynx-js/type-element-api/types/element-api.d.ts`. | Token installation is usable. This does not establish the background receiver contract below. |
| Send a background commit and return an ACK | Public primitives, Octane-owned protocol | `ContextProxy` in `@lynx-js/types/types/common/lynx.d.ts` exposes `postMessage`, `dispatchEvent`, `addEventListener`, and `removeEventListener`; `CommonLynx` exposes `getCoreContext()` and `getJSContext()`. | The probe may define versioned commit/ACK semantics over these primitives. The background waits for a main-ready handshake before mounting, and ACK is sent only after validation, PAPI application, and the single flush. Terminal destroy is an idempotent request outside commit sequencing, with responses correlated by request ID rather than commit version, so cleanup does not depend on agreeing which faulted commit applied. The receiver records an intended page-root append before entering PAPI so terminal cleanup can also remove a root when append mutates and then throws. |
| Receive a string-token native event in the background runtime | Injected/private and unresolved | The published test environment calls `globalThis.lynxCoreInject.tt.publishEvent`; ReactLynx installs `publishEvent` and `publicComponentEvent` in `packages/react/runtime/src/element-template/native/index.ts`. Neither `lynxCoreInject.tt` receiver appears in `@lynx-js/types@4.0.0` or `@lynx-js/type-element-api@0.0.8`. | **Stop gate.** Upstream or obtain a documented framework-neutral receiver before building the production event layer. The probe test’s explicit injection is test evidence, not a public native contract. |
| Main-thread render/update/global-props lifecycle messages | Public typed; engine behavior not yet proven | `LynxMessageEvent` in `@lynx-js/types/types/common/events.d.ts` includes `__RenderPage`, `__UpdatePage`, and `__UpdateGlobalProps`. | Implement only after the 3.9.0 native matrix confirms which context receives each event and its ordering. |
| Initial data and background global props | Public typed; integration unresolved | `@lynx-js/types/types/background-thread/lynx.d.ts` exposes `lynx.__presetData` and `lynx.__globalProps`. | Values can be read, but update ordering and ownership must be proven with `__RenderPage`/`__UpdateGlobalProps` on devices. |
| Page destroy on the native context | Public typed; engine behavior not yet proven | `LynxMessageEvent` includes `__DestroyLifetime`, and `CommonLynx.getNative()` returns a typed `ContextProxy`. Current ReactLynx main-thread code also listens through `getNative().addEventListener('__DestroyLifetime', ...)`. | Candidate framework-neutral teardown signal. It still requires Explorer, Android, and iOS evidence before acceptance. |
| Background destroy callback | Injected/private | ReactLynx assigns `lynxCoreInject.tt.callDestroyLifetimeFun`; it is absent from `@lynx-js/types@4.0.0`. | **Stop gate** unless the typed native destroy event is confirmed to reach and safely teardown the background runtime on all required engines. |
| Background reload callback | Injected/private | ReactLynx assigns `lynxCoreInject.tt.onAppReload`; it is absent from `@lynx-js/types@4.0.0`. `lynx.reload()` is a public request API, not a framework reload receiver. | **Stop gate.** A public reload/update lifecycle receiver must be confirmed or upstreamed. |
| Background card-data/global-props injection callbacks | Injected/private | ReactLynx assigns `updateCardData` and `updateGlobalProps` on `lynxCoreInject.tt`; these receiver hooks are absent from the selected public types. | Prefer the typed context events if native evidence proves them sufficient; otherwise upstream a neutral receiver. |
| Thread-specific bundle entries | Probe-owned build contract; engine execution unresolved | The Phase 0 plugin maps separate main/background source entries to the template chunks, and build verification confirms that the decoded programs use only their respective `getJSContext()` / `getCoreContext()` integration. Neither program branches on `__MAIN_THREAD__` or `__BACKGROUND__`. | The probe no longer depends on undocumented thread globals. Confirm both explicit entries execute on every required real engine before accepting the bootstrap contract. |
| Main-thread bootstrap via top-level execution or `globalThis.renderPage` | Unresolved | Official imperative examples use both top-level PAPI construction and an assigned `renderPage` callback; the selected public type packages do not define a framework bootstrap interface. | Real-engine spike must identify the supported bootstrap and lifecycle ordering before Milestone 1. |
| Mark a compiled asset as main-thread code | Published low-level | `LynxTemplatePlugin` consumes asset info containing `'lynx:main-thread': true`; upstream template-plugin tests and ReactLynx’s entry plugin use this convention. | Accept only for the exact pinned template/Rspack set; protect it with a production-build test. |
| Assemble and encode a production `.lynx.bundle` | Published low-level | `LynxTemplatePlugin`, `RuntimeWrapperWebpackPlugin`, and `LynxEncodePlugin` are published packages. The probe marks main-thread output, wraps background JavaScript, and encodes with `inlineScripts: true`. | The resulting bundle is a valid build artifact, but decoding it is not engine execution. |

## Probe-specific conclusions

The published JavaScript testing environment is valuable for protocol and PAPI
tests, but it deliberately models some engine behavior. In particular,
`__FlushElementTree` is a no-op there and string event delivery resolves through
the injected `lynxCoreInject.tt.publishEvent`. The probe’s adapter-level flush
counter and explicit test injection therefore validate Octane’s observation
boundary without turning those modeled behaviors into public engine contracts.

The current probe should remain React-free. `dsl: "react_nodiff"` is template
encoder metadata used for a framework-owned PAPI tree; it is not permission to
install ReactLynx or copy `pluginReactLynx()` wholesale.

The pinned Web-core source calls `globalThis.renderPage?.(processedData)` after
loading the main-thread root and then flushes the element tree. The probe and
imperative control both install `renderPage`, `updatePage`, and
`updateGlobalProps`; nevertheless, fresh Chromium runs first fail before
rendering with the same `MutationObserver.observe` non-Node target error. The
transported path additionally reports that Web `postMessage` is unimplemented.
Because the direct-PAPI control shares the first bootstrap failure, Phase 0
records this as an unresolved Web/toolchain gate rather than attributing that
failure to Octane's transport.

## Gate decision

Milestone 0 is **blocked from exit**, not failed. PAPI mutation and context
transport have sufficient public surface for the spike, while background native
event delivery and reload/background teardown do not yet have a confirmed
framework-neutral contract. Per the migration plan, do not begin the production
port until those hooks are documented or upstreamed and the exact 3.9.0 bundle
passes Explorer, Android, and iOS execution gates.
