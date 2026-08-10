---
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
execution: code
---

# React PDF binding plan

## Objective

Ship `@octanejs/pdf` as an exact Octane binding for the published
`react-pdf@10.4.1` root contract and its documented worker/CSS entry points,
with real PDF.js worker, canvas, text, annotation, browser, and SSR evidence.

## Upstream authority

- npm package: `react-pdf@10.4.1`
- repository: `wojtekmaj/react-pdf`, package directory `packages/react-pdf`
- tag: `v10.4.1`
- commit: `5338e7a24c7ad17d1028146cf8a025a75e0abe79`
- license: MIT, copyright 2017–2024 Wojciech Maj
- npm integrity:
  `sha512-kS/35staVCBqS29verTQJQZXw7RfsRCPO3fdJoW1KXylcv7A9dw6DZ3vJXC2w+bIBgLw5FN4pOFvKSQtkQhPfA==`
- root runtime exports: `pdfjs`, `Document`, `Outline`, `Page`, `Thumbnail`,
  `useDocumentContext`, `useOutlineContext`, `usePageContext`, and
  `PasswordResponses`
- root type exports: `DocumentProps`, `OutlineProps`, `PageProps`,
  `PasswordResponsesType`, `StructTreeNode`, `TextContent`, `TextItem`,
  `TextMarkedContent`, `ThumbnailProps`, and `LinkService`
- source test authorities: all 13 pinned `packages/react-pdf/src/**/*.spec.*`
  and `index.test.ts` suites, plus the published declaration surface

## Implementation units

### U1 — feasibility and public-surface ledger

Before broad component work, prove the exact architecture with reduced probes:

1. Import `pdfjs-dist@5.4.296` through Octane's client, server, and test
   pipelines without loading React or a second renderer.
2. Load a pinned PDF through an actual PDF.js worker in Chromium and Firefox;
   verify worker URL/package conditions and cancellation/cleanup.
3. Render a real page to canvas, text layer, and annotation layer using the
   native PDF.js APIs that the binding must orchestrate.
4. Prove SSR can render deterministic loading/error/page-shell markup without
   accessing browser globals, workers, or canvas, then hydrate that shell.
5. Inventory every root export, root type, documented CSS path, worker path,
   and wildcard package subpath. Classify each as exact public support,
   framework-private evidence only, or an explicit blocker; wildcard exports
   may not be silently narrowed.

If any probe requires mapped React execution, a second renderer, fake worker,
or test-only canvas behavior that cannot survive a packed consumer, stop at U1
and record the concrete repository/product prerequisite instead of shipping a
partial binding.

### U2 — exact package and component contract

1. Add a publishable `packages/pdf` package with pinned license,
   provenance, status, metadata, styles, worker entry, and migration docs.
2. Port `Document`, `Page`, `Thumbnail`, and `Outline` with Octane context,
   native refs/events/styles, cancellable PDF.js tasks, callback ordering,
   loading/error/no-data states, password flow, page registration, links,
   outlines, thumbnails, and controlled rerender behavior.
3. Port canvas, text, annotation, and structure-tree layers without React DOM;
   preserve render-mode selection, scale/rotation, device-pixel ratio,
   cancellation, cleanup, accessibility, and custom-renderer behavior.
4. Preserve the nine runtime exports and ten root type exports exactly,
   adapting only React node/ref/event/style types to their Octane equivalents
   and documenting every deliberate type adaptation.

### U3 — fail-closed React parity

1. Vendor the full published npm artifact and pinned tag source, tests,
   fixtures, snapshots, metadata, and license required by the 13 upstream
   suites.
2. Record SHA-256 inventories and an injective case map for every upstream test
   identity and declaration program.
3. Add negative controls for missing/extra artifacts, stale checksums, renamed
   or duplicated cases, changed mappings, fixture drift, and unsupported public
   subpaths.
4. Run pristine React and adapted Octane programs plus deterministic
   differential cases for observable DOM, callbacks, errors, loading, context,
   page lifecycle, and cancellation.

### U4 — server, browser, and packed-consumer proof

1. SSR, streaming, and hydration cover loading/error shells, document/page
   context, deterministic markup, browser-global safety, and post-hydration
   worker/page adoption.
2. Chromium and Firefox load the same pinned PDF with a real worker and verify
   canvas pixels/dimensions, selectable text, annotations/links, outline,
   thumbnails, navigation, password/error handling, rerender, cancellation,
   and unmount cleanup.
3. A packed outside-workspace consumer proves ESM, documented CSS and worker
   imports, client/server builds, SSR execution, one Octane runtime, and no
   React runtime dependency.

### U5 — repository integration and delivery

Integrate workspace dependencies, Vitest projects, React parity manifests,
generated package/status/parity inventories, website binding data, CLI and MCP
mapping, playground demo, changeset, and package pack inspection. Run package,
browser, global parity, generated-data, MCP, playground production-build, and
format/diff gates.

## Delivery policy

- One isolated branch and one PR for this binding.
- Open the PR as draft and keep it draft through CI and Cursor/Bugbot feedback.
- Resolve valid review findings with tested follow-up commits.
- Only an Octane maintainer marks the PR ready or merges it.

## Progress checkpoint

- U1 complete: `pnpm --dir packages/pdf test:feasibility` passes 5 files and
  10 tests across pristine Node, SSR, hydration, Chromium, and Firefox.
- The browser probe production-builds the harness and proves an actual
  `Worker`-backed PDF.js loading task, canvas/text/annotation rendering,
  outline retrieval, cancellation, and cleanup.
- `upstream-public-surface.json` pins all nine runtime exports, ten root types,
  both documented CSS subpaths, the unchanged PDF.js worker import, and a
  fail-closed classification of all 94 artifacts exposed by the permissive
  upstream wildcard.
- The server architecture uses the PDF.js legacy build while pristine Node
  rejects the modern build; browser code uses the modern build and emitted
  module worker. The full package must preserve this conditional boundary.
