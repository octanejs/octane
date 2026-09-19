# Private compiled Context reachability

The unchanged committed context fixture drops from **66,315 to 35,477 bytes gzip**
(−30,838 bytes, −46.5%) against `481819ec22873f1c7d0c2b445987e946a18f77f2`.
Raw output drops from 208,040 to 106,690 bytes. The other five stock consumer
bundles and the generic `createRoot` export have identical complete bundle hashes,
raw, gzip, and Brotli sizes. All fifteen public engine/server/native/binding and
used-signal closures also have identical complete bundle hashes and sizes.

This removes both the private Context factory's generic child dialect path and
the provider call's generic returned-value renderer. The reduction includes that
general element/array rendering graph and its optional signal/control branches;
it is not thirty kilobytes of signal code alone. No code is deferred into another
chunk or transferred into model/SSR entries.

## Admission and unchanged contracts

Only a private, top-level immutable binding initialized by the exact lexical
`createContext` import from `octane` is considered. Its complete authored runtime
lifetime must consist of canonical lexical `use`/`useContext` reads or direct
compiled-template provider tags. Export, alias, reflection, direct calls/roots,
`createElement`, descriptor children, spread/explicit/inherited/internal children,
render-prop functions under TypeScript wrappers, shadows, eval, and missing scope
metadata decline admission. Source rewriting is copy-on-write and retains the
factory callee's authored source range. Server, development, HMR, profiling, and
custom-renderer/universal compilation stay generic.

The private factory preserves the registered Context function, default/version
metadata, provider stamping/epoch, stable child-body identity, hook lifetime,
shared-output invalidation, journal rollback, and cleanup. It adds no Scope field,
capability registration, per-render optional factory call, or rendering queue.
There is still one Context closure per creation. Shared initialization is a cold
call once per Context creation; existing generic factories use the same metadata
initialization.

## Matched measurement

Both snapshots use Node 24.19.0, pnpm 11.15.1, Vite 8.1.5, esbuild 0.28.1,
Alien Signals 3.2.0, and identical frozen lockfile
`af0457e80aa081883f866fdda8aae261145eac1dd08ca9a592a0b24b3984004b`.
`bundle-hashes.json` records exact authored input, source, tooling, runner, and
whole output hashes with all seven stock and fifteen public rows. Fixture bytes
are committed `481819` inputs, not edited historical inputs. The old archived
context fixture used the removed `Context.Provider` API and cannot be compared
silently against this direct-context fixture.

Production stock Vite runs include public output/update/cleanup verification;
public esbuild closures include export loading, graph boundary guards, engine and
SSR smoke controls. The CI-owned bundle test additionally requires the private
context bundle to be below 70% of an exported-context control, executes updates and
cleanup in both, and invokes the exported callable context with descriptor children.

## Preservation and falsification

- 484 public dev/prod results pass across private/generic contexts, context epoch,
  descriptor children, server context children, held transitions, native direct
  signals, Action lifecycle, and same-file roots. This includes all 42 focused
  cases: default/nested values, native state, memo modes, Strong compilation,
  held-Suspense state/DOM identity, SSR adoption, opaque handles after scalars,
  function-valued holes, exported/escaped contexts, and inherited descriptor props.
- All 26 Node bundle-boundary tests pass, including 31 authored lifetime/dialect
  negatives, a frozen copy-on-write unscoped-reference admission control, and
  exact callee source-range/deployment-mode controls.
- The shared source loader calls the public compiler explicitly without a
  renderer registry. Factory selection is recorded: production memo on/off and
  Strong select the private ABI; development and server retain generic contexts.
- Omitting only private provider stamping fails 18 of the 42 public cases;
  admitting escaped/opaque contexts fails all 14 selected descriptor cases;
  disabling private admission fails the ratio guard. Each source is restored
  exactly afterward.
- Six paired real Chromium 149.0.7827.55 production executions pass: private,
  escaped, and opaque providers adopt matching SSR, then a trusted native click
  publishes the new value while retaining host/control identity, an uncontrolled
  draft, focus, and caret `[2, 8]`. A later root update retains them too; cleanup
  runs once. Console warning/error and page-error capture starts before navigation
  and remains empty. `bundle-hashes.json` records the observations and emitted
  private/generic factory selection.

An unhandled root error also clears its host on the exact baseline. The recovery
case does not invent host identity across that remount. Held-Suspense tests protect
the existing accepted-output identity contract instead.

## Limits

This is a bundle-reachability claim. No CPU, compile-time, heap, SSR-throughput,
layout, paint, universal/browser-wide parity, or complete unused-signals regression
recovery claim is made. Exported/generic contexts intentionally erase this saving.
The lexical proof creates temporary compiler analysis state only for modules with
candidate private contexts; no new runtime cache survives unmount.
