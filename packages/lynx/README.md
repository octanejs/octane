# Octane Lynx Phase 0

This directory contains the evidence for Milestone 0 of the ReactLynx-to-Octane
native renderer plan. It is an upstream audit and a deliberately small,
React-free framework probe—not the future `@octanejs/lynx` package.

## What the probe proves

- A published, exact Lynx/Rspeedy/Rsbuild/Rspack compatibility set can build
  framework-owned main- and background-thread programs.
- The official JavaScript testing environment accepts an Element PAPI tree,
  an acknowledged background update, a native-token tap, and teardown.
- Complete batches are validated before PAPI mutation, and accepted batches
  cross one explicit flush boundary before acknowledgement.
- Production native and Web bundles contain no ReactLynx or Preact runtime.

The `imperative` entry is a small direct-PAPI control. The `main` entry runs the
same visible tree through the Phase 0 background commit protocol.

## Current decision

Milestone 0 is **blocked from exit**. The selected public packages expose PAPI,
cross-thread contexts, and typed lifecycle messages, but do not expose a
framework-neutral background receiver for native string event tokens. The
ReactLynx path uses `lynxCoreInject.tt.publishEvent`; reload and background
teardown also depend on injection-specific callbacks.

The production Web control and transport bundles currently fail before
rendering under `@lynx-js/web-core@0.22.2` with a `MutationObserver` target type
error; the transported path additionally reports that Web `postMessage` is not
implemented. Explorer, Android, and iOS execution are unavailable on the
capture host. These are explicit gates, not skipped tests. Do not begin the
production renderer port until the public-hook blockers are resolved and the
exact bundle passes the required engine matrix.

See:

- [`audit/toolchain.json`](./audit/toolchain.json) for immutable versions,
  commits, tarball integrities, and host constraints.
- [`audit/upstream-crosswalk.json`](./audit/upstream-crosswalk.json) for the
  ReactLynx public/test inventory and remaining runner-expanded case gate.
- [`audit/framework-contracts.md`](./audit/framework-contracts.md) for the
  public/private framework boundary.
- [`audit/phase-0-evidence.json`](./audit/phase-0-evidence.json) for captured
  results and blocked device/runtime gates.
- [`UPSTREAM.md`](./UPSTREAM.md) for provenance and reuse policy.

## Reproduce

The probe intentionally owns a standalone npm lock so the pinned Rspack graph
cannot be changed by the monorepo catalog.

```bash
cd packages/lynx/probe
npm ci --ignore-scripts
npm run phase0
```

To inspect the Web gate locally after building:

```bash
npm run serve:web
```

Open `http://127.0.0.1:4177/` for the transported probe or add `?imperative`
for the direct-PAPI control.
