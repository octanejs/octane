# Deferred template child bundle audit

Production DOM boundaries with compiler-generated template children and no authored fallback select a smaller private Hydrate body. On the unchanged `split={false}` deferred fixture, gzip falls from **91,463 to 64,913 bytes (-26,550, 29.0%)** against main `481819ec22873f1c7d0c2b445987e946a18f77f2`. This removes three generic edges: Hydrate returned-output rendering, child descriptor normalization, and the absent-fallback descriptor slot. The real non-null empty pending body remains.

## Matched whole-output measurements

Node 24.19.0, Vite 8.1.5, esbuild 0.28.1, darwin/arm64; the same frozen lock/tool provider serves baseline and candidate. Vite library IIFE builds use production defines, target `esnext`, `hmr:false`, and esbuild minification. gzip uses level 9 and Brotli quality 11. The generic createRoot export control uses esbuild ESM. Hashes, fixture identities, tool entries and runner hashes are in [evidence.json](./evidence.json).

| Consumer | Main gzip | Candidate gzip | Delta |
| --- | ---: | ---: | ---: |
| root-static | 24,574 | 24,574 | +0 |
| hooks-state | 28,579 | 28,579 | +0 |
| context | 66,315 | 66,315 | +0 |
| hydrate-root | 46,396 | 46,396 | +0 |
| suspense-transition | 50,805 | 50,805 | +0 |
| deferred-hydration | 91,463 | 64,913 | -26,550 |
| createRoot-export | 60,742 | 60,742 | +0 |

The deferred output falls by 87,674 raw bytes and 22,001 Brotli bytes. The other six outputs have identical bundle SHA/raw/gzip/Brotli. All six stock UI observations pass. The exact original deferred authored SHA is `d989278c273166b281729a60a5863f27423cca9c72158d2527d32ccaaacee256`; its reconstructed main330 output with the current lock is 93,135 gzip. Historical Context uses the removed Provider API, so the full historical table is not an unchanged-input comparison.

All 15 public closure controls retain exactly the same raw and gzip bytes, including standalone engine, native client/server, compiled signals, streamed bootstrap, and used native client/SSR. Fourteen have identical output hashes and Brotli bytes. The used native app has minifier renumbering, unchanged 248,639 raw/78,989 gzip, and 68,528→68,523 Brotli. This patch introduces no measured engine/SSR size transfer; previously landed tradeoffs remain.

## Scope and lifecycle evidence

The client Hydrate lowering leaves literal `split={false}` boundaries intact. Extracted split boundaries gain a `children` override and `__load`/independent attributes and lose direct children; these fail the private admission proof. The proof also requires the actual module-import binding and generated template children, and declines spreads, fallback (including explicit undefined/null), descriptor children, render props, private overrides, shadowed values and unsupported attribute names. Development, HMR, profile and universal compilation retain the general path. Forwarded renderable/signal holes keep their own policies.

Both paths share the existing strategy, preload, adoption, suspension, retry, error, abort and transition lifecycle. A static policy factory replaces no slot fields. The generic per-boundary closure count stays three; the private path uses two plus one shared empty pending function. Content invokes a static renderer policy rather than naming its implementation. No CPU speed claim is made.

Six native Chromium 149.0.7827.55 production executions compare three selected-source main/candidate consumers: dormant SSR→trusted keyboard activation→adopted stateful UI; generic fallback/descriptor output; parked adoption→retry and obsolete completion after unmount. Existing DOM/input identity, draft/focus/caret, IDs, state/props update and cleanup snapshots match. Console warning/error and page-error capture starts before navigation and stays empty. SSR HTML comes from each selected-source server compiler and public renderToString. This is bounded native coverage, not broad browser or SSR qualification.

The normal production Vitest project supplies a renderer registry and conservatively retains the generic path. Separate explicit compiled consumers therefore exercise production private-policy behavior as well as development fallback. Deliberate mutants confirm the observation boundary: null pending exposes the outer fallback; admitting authored fallback erases its output; ignoring lexical ownership breaks a shadowed component; disabling specialization fails the whole-consumer bundle ratio while the late actual-handle control still passes. Exact source bytes are restored afterward.

## Reproduction and qualification

Use dedicated clean baseline/candidate checkouts with Node 24.19.0 and the same frozen lock. Existing repository commands reproduce the fixed consumer and deterministic guarded comparison:

```sh
node benchmarks/bundle-size/run-minimal.mjs deferred-hydration
node --test benchmarks/scoped-signals/deferred-boundary.test.mjs
pnpm ci:workflow:test
pnpm exec vitest run packages/octane/tests/hydration/deferred-template-consumer.test.ts packages/octane/tests/hydration/deferred-template-children.test.ts --project=octane --project=octane-prod
```

The committed guard builds the unchanged stock consumer and an explicit-undefined fallback control, verifies both public UI snapshots, and requires a material relative byte reduction. It also checks 20 ownership/configuration/mode controls and real text/title/controlled-value handles after a late model-engine import. The root CI workflow runs it through `ci:workflow:test`. Caps are unchanged; matched deltas are separate from budget qualification. Exact audit values above use the stated Vite IIFE method and pinned source resolver; other harness output formats may have different absolute bytes.

Local checks cover 22 new public-test results across normal/production projects (three explicit compiled-consumer definitions also loop production/development internally), 156 adjacent deferred results, 467 nearby compiler/frozen-emit/signal results, and 204 Node CI-workflow results. The latter uses process-scoped `GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=commit.gpgsign GIT_CONFIG_VALUE_0=false` only for disposable Git-fixture commits; authored task signing/configuration/hooks are unaffected. Existing deferred contracts cover shared-factory transition remove/cancel resource lifetime, partial adoption, retry and abort. The own-realm consumer harness uses public act with authentic Node MessageChannel transport and closes its ports. Current-head CI status is reported separately in the PR. No claim is made that all remaining unused-signals retention, default split boundaries, Context or the full reported issue1118 regression is fixed.
