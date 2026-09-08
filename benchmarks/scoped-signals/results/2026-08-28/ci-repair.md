# CI repair and final TSRX measurements

These checks cover the repaired source after
`f16c0bc734c7e2408f73753cf9569a05ffe04ff0`. The first CI run after the author
marked PR 877 ready exposed runtime regressions and stale generated metadata.
The earlier `parity-*` reports retain their original source and measurements;
they are not relabeled as checks of this repaired source.

## Correctness and generation

The runtime fixes preserve three observable contracts:

- Nested Suspense portals disconnect refs once while hidden, preserve host
  identity, and reconnect only when visible. Both resolution orders,
  simultaneous resolution, and reentrant unmount/replacement are covered.
- A caught deletion error reports the original error once and prevents
  effects from connecting on a replacement abandoned by that catch.
- When urgent state supersedes every held transition update, resolving the
  latest request reveals the latest value without a fallback flash. A stale
  request cannot overwrite that value. The TanStack Query integration remains
  unchanged alongside the smaller state-only regression.

The new regressions failed before their fixes. The combined targeted run passes
76 development/production assertions. The broader frozen-source check passes
1,352 non-browser assertions, followed by four Chromium assertions in an
approved browser-only rerun. Its 1,144 source/configuration hashes match the
live worktree. The original setup failures remain recorded: detached copies
initially lacked dependency links and a browser helper, and Chromium required
permission outside the sandbox. These are not claimed as successful commands.

The copied root and package manifests preserve the actual monorepo policy.
Configured native development, production, and strong projects retain their
normal options; this does not claim that every legacy fixture forcibly opts
into Strong mode. Ordinary component and hook behavior is unchanged.

Native compiler-version and server-hook errors now use catalog codes 58 and
59. Final client/server development and production bundle checks pass, as do
the catalog check and its four generator tests. The generated CLI catalog
contains the same explanations. The compiler audit now recognizes the
existing parse of authored manual-slot modules, the MCP benchmark schema lists
both new suites, and the export contract includes the intended CommonJS
signals and compiler-runtime entries.

Formisch's generated manifest no longer hashes the shared root Vitest config
as support evidence, as required by the existing parity contract. Live project
ownership and execution checks remain in place; its six runtime lanes still
account for all 550 cases and all 11 required lanes remain required. The
validator now rejects that unsupported fingerprint pattern. Regenerating the
19-task eval corpus changes only each task's overlay lockfile and grader
digests, with all other parsed values unchanged.

The remaining canonical sync generators pass against identical staged inputs.
Only CLI catalog data changes; scaffold, consumer configurations, and generated
agent instructions stay unchanged. Local locked installation and `pnpm sync`
still fail because the configured registry denies the TSRX payloads with HTTP
403. The supplemental public tagged compiler/formatter is not a locked npm
installation. No dependency versions or registry policy were changed.

The [validation record](ci-repair-validation.json),
[generator reconciliation](sync-reconciliation.json), and
[format provenance](ci-format-f16c.json) retain the commands, original report
hashes, source checks, and before-fix evidence. Historical JSON formatting
preserves its parsed values and records the original Git bytes.

## Final compiled prop updates

The unchanged focused runner compares authored `@{}` fixtures with
`cd9ed33754bfc3eeb144ba256dc9b437614e3e92`. Each process uses eight warmup
blocks per version and 25 paired rounds of 10,000 updates, with seeded ABBA or
BAAB order. All samples are retained; no CPU or GC correction is applied.
Output, surviving host identity, signal writes, and teardown controls pass.

| Compiled TSRX case | Run 1 ratio, 95% interval | Run 2 ratio, 95% interval |
| --- | --- | --- |
| Unread, native disabled | 0.999 (0.955–1.044) | 1.014 (0.998–1.029) |
| Unread, native enabled | 0.976 (0.948–1.004) | 0.985 (0.949–1.022) |
| One signal read | 1.026 (0.988–1.065) | 0.997 (0.985–1.009) |
| 16 reads of one signal | 0.977 (0.950–1.005) | 0.980 (0.953–1.008) |
| 16 distinct signals | 1.012 (0.983–1.042) | 1.020 (0.998–1.043) |

Ratios are current/baseline, so lower is faster. Every interval includes
parity. The one-signal point estimates are close to parity, but neither a
speedup nor exact zero overhead is established. The earlier 28.6% point
regression was not reliably reproduced on unchanged source. Absolute times
also moved substantially between these processes, reinforcing the need for
the paired comparison and the retained host/CPU/GC diagnostics.

Raw captures: [focused run 1](final-focused-01.json) and
[focused run 2](final-focused-02.json). Both use Node 26.4.0 on the same macOS
arm64 host. Task-owned tests and builds were paused during timing; unrelated
host load was not controlled. The ten common compiled bundles match across
both repeats and the full runner. Baseline files match Git, including the
root/workspace/package manifests, and all measured source hashes remain stable.

## Other measured costs and limits

The [full mixed runner](final-native-costs-01.json) retains two warmups and nine
samples for mount, updates, unmount, SSR, and collector work. Its one-signal
`@{}` prop update is 1.707 to 1.852 microseconds, a 1.085 ratio, with 17.9% and
34.5% relative margins of error. That noisier, unfavorable result is retained
separately rather than pooled with the focused measurements. One-signal mount,
signal update, and SSR point ratios are 1.513, 1.177, and 1.108; they likewise
do not establish improvements. The factory controls still observe one mount
call, zero calls for 32 cache hits, and 32 calls for 32 misses. Observer and
write-guard restoration controls pass.

Ordinary return-JSX compatibility remains more expensive and is not covered by
the near-parity claim. Its one-signal prop update, signal update, and SSR ratios
are 1.980, 2.543, and 1.918. The enabled unread return case is 2.157 for prop
updates and 3.840 for SSR. All operation means, uncertainty, compiled bundle
sizes, and unfavorable rows remain in the machine-readable evidence.

Two independent [public-entry](public-bundles-01.json)
[bundle captures](public-bundles-02.json) reproduce all seven output hashes.
The ordinary client and server exports are byte-identical to `f16c0bc7`, at
44,134 and 12,340 gzip bytes respectively. Boundary checks still exclude the
scoped engine and emitted optional adapter implementations from those ordinary
entries. These are named export bundles, not complete application costs.

The fixes add work only to the affected error and Suspense paths, without a
new field or allocation on every component render. Captured hide callbacks
publish only after acceptance and are dropped on abandonment. Empty promotion
discards unused memo carriers before normal reveal. The existing promoted
entry array is reused, with a separate scheduling pass on that cold path.
These lifetime arguments and regression checks do not measure Suspense timing
or prove the absence of every leak.

The synchronous DOM measurements do not establish browser paint, hydration
timing, large application scaling, or DevTools memory behavior. Graph source
is unchanged, so the earlier raw-Alien cost and retention limitations remain.
Locked CI is tracked on [PR 877](https://github.com/octanejs/octane/pull/877/checks)
and is separate from these supplemental local results. No merge or package
release is part of this work.
