# Lynx upstream provenance

Phase 0 is based on immutable published artifacts rather than Lynx moving main.
The selected ReactLynx behavioral oracle is `@lynx-js/react@0.123.0`, whose
official package tag resolves to Lynx-stack commit
`b6b809cdbec99d20e51aa9521257644dc9db5272`. The native engine target is Lynx
SDK `3.9.0` at commit `d7f13487df0d69497148e93b71aded676a8fe243`.

Exact package versions, npm integrity digests, source commits, SDK assets, and
compatibility constraints are recorded in [`audit/toolchain.json`](./audit/toolchain.json).
The npm tarballs are the dependency authority; tagged source is the behavioral
and test oracle when tests are not shipped in the tarball.

The probe depends only on published framework-neutral Lynx packages. ReactLynx
and its Rsbuild plugin are reference-only and must not enter the production
dependency graph. `dsl: "react_nodiff"` is the only template DSL accepted by
the pinned encoder for this no-diff PAPI shape; it is encoder metadata, not a
React runtime dependency.

No Lynx or ReactLynx implementation source has been copied into this directory.
The renderer-owned declarations in `src/native-types.ts` adapt the public
`types/common/props.d.ts` and `types/common/events.d.ts` contracts from
`@lynx-js/types@4.0.0` (commit `2f20fed315aaba5f47e14e0f2b0f87c4cb1a64d6`).
The adapted file retains the upstream copyright/license notice and marks the
Octane-specific module-scoping change.

## Milestone 1–2 package boundary

The private package scaffold keeps `@lynx-js/types@4.0.0` pinned as the type
provenance authority, but does not import its `./props` or `./events` entries.
Although those entries appear framework-neutral, `./events` imports the
main-thread `Element` graph, which reaches the same global JSX augmentation as
`@lynx-js/types/element` and leaks Lynx tags into unrelated React/DOM authoring
contexts. `src/native-types.ts` therefore adapts the audited standard-prop and
event slice into module-scoped Octane declarations. A typetest imports React
alongside the renderer namespace and proves the two intrinsic maps stay
independent.

The type package is Apache-2.0 licensed, Copyright 2024–2025 The Lynx Authors.
Its registry artifact records git commit
`2f20fed315aaba5f47e14e0f2b0f87c4cb1a64d6`; its exact tarball integrity stays
recorded in [`audit/toolchain.json`](./audit/toolchain.json). No ReactLynx
runtime or React JSX declaration is a production dependency of the scaffold.

Milestone 2 calls only the audited public Element PAPI and public cross-thread
`ContextProxy` surfaces. Its adapter, host topology, transport protocol, and
root lifecycle are original Octane code; no Lynx or ReactLynx implementation
source was copied. `@lynx-js/testing-environment@0.3.0` is a development-only
behavioral host and is not shipped in the renderer graph.

The intrinsic declarations and JavaScript-environment host tests are not a
native layout or device claim. The Phase 0 public hook, reload/background
teardown, Web, and Android/iOS gates remain authoritative until later
production/device milestones satisfy them.

Milestone 1 syntax and built-in assumptions for the exact Rspeedy graph are
recorded in [`audit/runtime-compatibility.json`](./audit/runtime-compatibility.json).
That evidence is tied to published Lynx scripting-runtime documentation and
production JavaScript builds for both compiler layers. It does not claim that
the main-thread bytecode or background program executed on a native device.
