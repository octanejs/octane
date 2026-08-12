# Vaul binding port

## Goal

Ship `@octanejs/vaul` as the source-compatible Octane migration target for `vaul@1.1.2`, with one isolated PR, pinned source/license evidence, and executable React parity evidence.

## Pinned upstream

- npm package: `vaul@1.1.2`
- repository: `https://github.com/emilkowalski/vaul.git`
- tag/commit: `v1.1.2` / `73d06cdd3fd990bf4b83214cfe240c246908af0d`
- license: MIT, Copyright (c) 2023 Emil Kowalski
- npm tarball SHA-256: `d062e21bae0c864c3559707c0451edabc0aac32a22eda239064a3faa7c9f1b21`

## Public contract

Preserve the root exports `Drawer`, `Root`, `NestedRoot`, `Portal`, `Overlay`, `Content`, `Handle`, and the public prop types. Reuse `@octanejs/radix` Dialog primitives rather than carrying the React Radix dependency.

## Execution

1. Vendor the exact upstream source, browser fixtures, tests, package metadata, and license; record and enforce file hashes.
2. Port framework-neutral helpers first, then controllable state, snap-point behavior, body/viewport effects, drawer context, and the public components.
3. Preserve Vaul's `data-vaul-*` DOM contract and stylesheet unchanged wherever framework-neutral.
4. Register package, catalogs, changeset, MCP mapping, website catalog, generated inventories, and dedicated Vitest projects.
5. Build exact-identity adapted DOM and SSR parity lanes plus a real Chromium lane. Use the real React package as an oracle for export shape and stable DOM/data-attribute snapshots.
6. Cover open/defaultOpen/controlled close, escape/outside interaction, dismissible false, four directions, pointer drag thresholds, handle-only behavior, snap points, nested drawers, focus/portal semantics, body scroll restoration, and cleanup.
7. Run package typecheck/tests, browser proof, pack validation, generated checks, and the repository-wide React parity audit.
8. Run LFG simplification and correctness reviews, address findings, then commit, push, open one PR, and babysit CI/review to merge.

## Honest parity boundary

Do not mark upstream parity verified unless every declared upstream test identity is executed or explicitly classified by the repository harness. Until then, retain the full pinned suite for provenance and use `recorded-unverified` with bounded executable lanes.
