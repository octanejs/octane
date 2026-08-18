# Upstream provenance

This binding targets `vaul@1.1.2` from
[`emilkowalski/vaul`](https://github.com/emilkowalski/vaul), tag `v1.1.2`, commit
`73d06cdd3fd990bf4b83214cfe240c246908af0d`.

The exact React source, complete Playwright test boundary (Next demo app, specs,
Playwright config, workspace metadata), package metadata, README, stylesheet, and
MIT license used for the port are retained under `upstream/`, vendored from the
tagged git repository. Byte inventory is locked by `upstream/SHA256SUMS`. The npm
tarball SHA-256 is `d062e21bae0c864c3559707c0451edabc0aac32a22eda239064a3faa7c9f1b21`
(published package surface only). Run `pnpm --dir packages/vaul upstream:check` to
verify the vendored evidence.

## Source boundary

Upstream's React drawer implementation under `upstream/src` is re-authored in
`packages/vaul/src/index.tsrx` against `@octanejs/radix` Dialog primitives and
Octane hooks. The published stylesheet is reused as `src/style.css`.

## Test-suite disposition

| Upstream artifact | Disposition |
| --- | --- |
| `test/tests/base.spec.ts` | **Adapted (partial).** Open/close through trigger and `Drawer.Close`: `tests/drawer.test.ts` (`// Per …:10`, `:27`). Controlled prop close via external `controlled-close` button: same file (`// Per …:35`), waiting the exit interval before asserting `[data-vaul-drawer]` is gone. Open-state semantic snapshot vs published React Vaul: `tests/differential/react-oracle.test.ts` (`// Per …:10`). Browser lane covers open/close focus/styles/cleanup. Upstream drag-down close (`:49`) remains a gap; the unpaired snap-point mid-drag-stays-open contract lives in ordinary `vaul-browser-conformance`, not parity evidence. `defaultOpen` and context-menu-cancel drag remain gaps. |
| `test/tests/controlled.spec.ts` | **Gap.** Overlay dismiss with `open` + `onOpenChange` (`:20-29`) is not yet re-authored: `tests/drawer.test.ts` only exercises the external `controlled-close` button from `base.spec.ts:35`, and the browser lane closes through `Drawer.Close`. Overlay non-dismiss when only `open` is passed also remains a gap. |
| `test/tests/initial-snap.spec.ts` | **Adapted (partial).** Initially-open fixture uses pinned snap values `[0, '148px', '355px', 1]` at `'148px'` and asserts active snap index `1`: `tests/browser/vaul.browser.test.ts` (`// Per …:24`). Upstream's commented drag-snap cases stay unported. |
| `test/tests/with-handle.spec.ts` | **Adapted.** Handle click cycles pinned `['148px', '355px']` from index `0` to `1`: `tests/browser/vaul.browser.test.ts` (`// Per …:9`). |
| `test/tests/nested.spec.ts` | **Out of scope for current lanes.** Nested drawer open/close is not yet re-authored; tracked as a surface gap, not counted as parity evidence. |
| `test/tests/non-dismissible.spec.ts` | **Out of scope for current lanes.** `dismissible={false}` overlay/drag refusal is not yet re-authored; tracked as a surface gap. |
| `test/tests/with-redirect.spec.ts` | **Out of scope.** Asserts body scroll-lock restore across a Next.js client navigation that this package does not host. |
| `test/tests/with-scaled-background.spec.ts` | **Out of scope for current lanes.** Scaled-background CSS transform under drag is not yet re-authored. |
| `test/tests/without-scaled-background.spec.ts` | **Out of scope for current lanes.** Negative scaled-background assert is not yet re-authored. |
| `test/tests/helpers.ts`, `test/tests/constants.ts` | Support only; not executable cases. |

## Port-authored test classification

| File | Classification | Pairing |
| --- | --- | --- |
| `tests/drawer.test.ts` | adapted upstream | cites `upstream/test/tests/base.spec.ts` open/close cases |
| `tests/differential/react-oracle.test.ts` | React/Octane differential | same open-drawer scenario against published `vaul@1.1.2` on React and `@octanejs/vaul`; also cites `base.spec.ts:10`; owned by `vaul-differential` |
| `tests/exports.test.ts` | Octane-only framework contract | root/`Drawer` export keys match pinned `vaul@1.1.2`; ordinary `vaul` shard only — not react-parity ownership |
| `tests/ssr/server.test.ts` | Octane-only framework contract | unpaired — upstream ships no SSR suite; closed trigger must render without browser globals. Runs in ordinary Vitest shards; not React-parity evidence. |
| `tests/browser/vaul.browser.test.ts` | adapted upstream (real browser) | cites base open/close, initial-snap load, and with-handle cycle; executes in the `vaul-real-browser` lane |
| `tests/browser-conformance/snap-drag.browser.test.ts` | Octane-only browser contract | unpaired snap-point mid-drag release stays open; `vaul-browser-conformance` project, not React-parity evidence |
| `tests/types/public-api.ts` | Octane-only framework contract | optional package-conformance declaration probes; not required parity evidence (no structural inventories/controls yet) |

Upstream ships no type-test suite at `v1.1.2`. Package behavior is covered by
ordinary adapted, differential, SSR, and browser projects.
