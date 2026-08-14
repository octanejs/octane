# Upstream

- Repository: https://github.com/inokawa/virtua
- Release tag: `0.50.1`
- Commit: `d8ec8680a3b396c2c29082583ef10d28cc41baa8`
- Package: `virtua@0.50.1`
- Source root: `src/react`
- Test roots: `src/react` and `spec`
- License: MIT
- npm integrity: `sha512-rNue/Cv/0Z14Yg9Pj6Xx9QaQPKhmlNWkx7Y7SytRnhojxvZ0z3GhCWr4QH2+tJm5mYL2vm4GudZPPt0i1PLzSA==`

The Octane binding reuses the published framework-neutral
`virtua/unstable_core` package entry. Only the React adapter layer is
transcribed to Octane hooks and `.tsrx`; React is not a runtime dependency.

`packages/virtua/upstream` retains the pinned React source, core source, tests,
fixtures, package metadata, and license as unpublished provenance evidence.
`pnpm --dir packages/virtua upstream:verify` checks their deterministic
byte-level tree fingerprint recorded from that Git commit.

## Upstream test-suite disposition

The pinned React runtime and SSR test files are retained under
`upstream/src/react`. The Octane suite covers every public component, SSR,
imperative handles, data updates, custom elements, real Chromium measurement,
and sibling/remount hook isolation. The binding does not claim verified
one-for-one React parity until every upstream assertion has an adapted identity;
provenance remains `recorded-unverified`.
