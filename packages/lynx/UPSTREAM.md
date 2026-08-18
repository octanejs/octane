# Lynx upstream provenance

Phase 0 is based on immutable published artifacts rather than Lynx moving main.
The selected ReactLynx behavioral oracle is `@lynx-js/react@0.123.0`, whose
official package tag resolves to Lynx-stack commit
`b6b809cdbec99d20e51aa9521257644dc9db5272`. The native engine target is Lynx
SDK `3.9.0` at commit `d7f13487df0d69497148e93b71aded676a8fe243`.

The probe depends only on published framework-neutral Lynx packages. ReactLynx
and its Rsbuild plugin are reference-only and must not enter the production
dependency graph. `dsl: "react_nodiff"` is the only template DSL accepted by
the pinned encoder for this no-diff PAPI shape; it is encoder metadata, not a
React runtime dependency.

## Milestone 1–5 package boundary

The renderer-local declaration provenance remains pinned to
`@lynx-js/types@4.0.0`, while the exact source/build compatibility lanes may
install a newer registry-verified type package. The package does not import the
upstream `./props` or `./events` entries. Although those entries appear
framework-neutral, `./events` imports the main-thread `Element` graph, which
reaches the same global JSX augmentation as `@lynx-js/types/element` and leaks
Lynx tags into unrelated React/DOM authoring contexts. `src/native-types.ts`
therefore adapts the reviewed standard-prop and event slice into module-scoped
Octane declarations. A typetest imports React alongside the renderer namespace
and proves the two intrinsic maps stay independent.

Milestones 2–4 call only the reviewed public Element PAPI, list PAPI,
selector-query, background platform, and cross-thread `ContextProxy` surfaces.
The adapter, host topology, prop/event/list boundary, query handles, transport
protocol, and root lifecycle are original Octane code; no Lynx or ReactLynx
implementation source was copied.
`@lynx-js/testing-environment@0.3.0` is an optional peer and the implementation
behind the packaged `@octanejs/lynx/testing` facade. It remains a
JavaScript-only behavioral host and is not imported by the renderer graph.

The app-owned files under `examples/native-capabilities` use the reviewed
generated-spec seam and the current official native-library Autolink
registration markers. They are illustrative source, are excluded from package
files, and have not been compiled against the pinned SDK or run on Android or
iOS. Their presence is not native capability evidence.

The public `__AddEvent` operation installs a string token but does not publish a
framework-neutral background callback receiver. Octane's
`dispatchNativeEvent*` methods therefore remain a source/test bridge and do not
satisfy the `lynxCoreInject.tt.publishEvent` stop gate. Likewise, the public
query types expose `createSelectorQuery().select(string)` but leave
`selectUniqueID` commented out, so Octane installs a generation-scoped
`[octane-ref]` selector and still requires real-engine selector/layout evidence.
The testing environment models complete dataset application with
`Object.assign` and does not implement native `invoke`, `fields`, or `path`;
dataset-key deletion and asynchronous query results are not native claims.

`@lynx-js/types@4.0.0` also types `CommonLynx.getNative()` and the native
`__DestroyLifetime` message. The pinned ReactLynx main runtime listens to that
same public context. Octane now installs an independent listener, closes its
main PAPI state, and broadcasts root-independent logical teardown to the
background root; it does not copy ReactLynx's teardown implementation or use
`lynxCoreInject.tt.callDestroyLifetimeFun`. JavaScript-host tests prove the
Octane cleanup contract only. Explorer, Android, and iOS must still establish
that the typed event is delivered on the expected context with safe ordering.

The same public type surface includes `CommonLynx.getEngine()`. At exact Lynx
SDK 3.9.0 commit `d7f13487df0d69497148e93b71aded676a8fe243`,
`TemplateAssembler::DispatchEventFromEngineToCoreContext` tries that Engine
`ContextProxy` listener before the legacy global-function fallback, and routes
`__RenderPage`, `__UpdatePage`, and `__UpdateGlobalProps` through the helper.
Octane's typed listener and root-independent data protocol are original code;
source and JavaScript-host tests establish their replace, merge, reset, and
global-patch behavior only. Explorer, Android, and iOS must still establish the
actual context, delivery order, payload completeness, and bootstrap timing.

The intrinsic declarations and JavaScript-environment host tests are not a
native layout or device claim. The Phase 0 public event hook, reconstructing
reload, typed data/destroy delivery, Web, and Android/iOS gates remain
authoritative until later production/device milestones satisfy them.


Create a clean detached checkout and generate the three ignored build products
that the test configs import. These are built from the pinned sources; do not
copy `dist` files from an npm tarball or another checkout. In particular,
`build:wasm` compiles the pinned Rust workspace, temporarily copies its emitted
Wasm module into the transform package, and bundles `dist/wasm.cjs` through the
checked-in build script.

```bash
lynx_checkout=/absolute/path/to/lynx-stack
git clone https://github.com/lynx-family/lynx-stack.git "$lynx_checkout"
git -C "$lynx_checkout" checkout --detach b6b809cdbec99d20e51aa9521257644dc9db5272
test "$(git -C "$lynx_checkout" rev-parse HEAD)" = b6b809cdbec99d20e51aa9521257644dc9db5272
test -z "$(git -C "$lynx_checkout" status --porcelain --untracked-files=no)"

cd "$lynx_checkout"
corepack pnpm install --frozen-lockfile
corepack pnpm --dir packages/react/transform build:wasm
corepack pnpm --dir packages/react/refresh build
corepack pnpm --dir packages/react/testing-library build

test -f packages/react/transform/dist/wasm.cjs
test -f packages/react/refresh/dist/index.js
test -f packages/react/testing-library/dist/plugins/index.js
test -z "$(git status --porcelain --untracked-files=no)"
corepack pnpm exec vitest --version # vitest/3.2.4
```

The Rust side is recorded without fabricating Cargo runner identities: the
artifact lists 89 source-defined test function identities across 11 files,
including the concrete names and identifier lines of tests produced by the
pinned `et_snapshot_test!` macro. All are classified out of scope. Generation
and `--upstream` validation rediscover those definitions and macro invocations
from this clean pinned checkout and compare the canonical per-case metadata and
digest.

Then collect the official Vitest task locations from that checkout:

```bash
lynx_checkout=/absolute/path/to/lynx-stack
runner_json=/absolute/path/to/runner-json
mkdir -p "$runner_json"
cd "$lynx_checkout"

pnpm --dir packages/react/runtime exec vitest list __test__/core --includeTaskLocation --json "$runner_json/core-loc.json"
pnpm --dir packages/react/runtime exec vitest list __test__/snapshot __test__/worklet-runtime __test__/guardrails __test__/shared/profile.test.ts --includeTaskLocation --json "$runner_json/snapshot-loc.json"
pnpm --dir packages/react/runtime exec vitest list --config __test__/element-template/vitest.config.ts --includeTaskLocation --json "$runner_json/et-loc.json"
pnpm --dir packages/react/testing-library exec vitest list --config vitest.config.ts --includeTaskLocation --json "$runner_json/testing-loc.json"
pnpm --dir packages/react/testing-library exec vitest list --config vitest.3.1.config.ts --includeTaskLocation --json "$runner_json/testing-3.1-loc.json"
pnpm --dir packages/react/transform exec vitest list --config vitest.config.ts --includeTaskLocation --json "$runner_json/transform-loc.json"
```

Then generate and validate the artifact from the Octane checkout:

The verified Milestone 9 reproduction generated the committed artifact
byte-for-byte. Validation also rejects a mismatched upstream commit, missing or
duplicate identities, stale source coverage, multiply matched overrides, and
unclassified runnable cases.
