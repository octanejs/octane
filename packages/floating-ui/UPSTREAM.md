# Upstream provenance

- Repository: https://github.com/floating-ui/floating-ui
- Release: `@floating-ui/react@0.27.19`
- Commit: `d8020ee98c702caa31fa9b4d929ca782c6b58c59`
- Source roots: `packages/core`, `packages/dom`, `packages/react`,
  `packages/react-dom`, and `packages/utils`
- Test roots: `packages/react/test` and `packages/react-dom/test`
- License: MIT
- npm integrity:
  `sha512-31B8h5mm8YxotlE7/AU/PhNAl8eWxAmjL/v2QOxroDNkTFLk3Uu82u63N3b6TXa4EGJeeZLVcd/9AlNlVqzeog==`

`upstream/` is a byte-exact, hash-verified tree from that commit. The pristine
lane runs the original React and React DOM runtime suites with the commit's
React 18.2.0, React DOM 18.2.0, Testing Library, tabbable 6.2.0, and Vitest
3.0.9 versions. The adapted lane regenerates the same tests under
`tests/upstream/` from `audit/upstream.lock.json`, then applies only the
reviewed patches in `audit/upstream-patches/`.

Both runtime lanes register the same 307 upstream cases. The pristine lane has
301 passes and six upstream-declared skips. The adapted lane crosswalks the
same 301 executed identities: 272 are compatible passes and 29 use Vitest's
`fails` modifier as executable negative controls for documented Octane
divergences. The same six upstream skips remain explicit non-evidence. See
`audit/runtime-crosswalk.json`, `audit/expected-failures.json`, and
`audit/upstream-skips.json`; no skipped or expected-failure case is counted as
an adapted compatibility pass.

The two original `index.test-d.tsx` programs also compile in pristine and
adapted type lanes. Their `@ts-expect-error` assertions are negative controls:
removing the expected diagnostic makes the typecheck fail.

The pristine type lane uses the commit's TypeScript 5.4.2,
`@types/react@18.3.19`, and `@types/react-dom@18.3.1`. The adapted lane uses
`tsrx-tsc` and records the permitted React-to-Octane transforms and the
combined-entry-point diagnostics in `audit/type-parity.json`.

The package's older differential lane remains supplemental evidence: it
compiles one repository fixture for React and Octane and compares independent
hook placement output. Real Chromium layout and `autoUpdate` coverage remains
in the ordinary `floating-ui-browser` project.
