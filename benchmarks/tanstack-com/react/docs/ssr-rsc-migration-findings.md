# SSR + Hydrate vs RSC findings

Date: 2026-06-20

Scope: local production builds of tanstack.com, with Redact enabled for both variants. The RSC baseline came from the current HEAD before the SSR migration work. The SSR variant is this worktree after removing RSC rendering and adding targeted `Hydrate` timing for below-fold media-heavy sections.

## Current conclusion

SSR + normal hydration + targeted `Hydrate` timing is the stronger direction for tanstack.com.

RSC reduced some client-side rendering responsibility, but it did so by sending rendered payloads, Flight data, extra server-function surfaces, and a lot of architecture-specific indirection. Once SSR is paired with simple visible hydration gates for below-fold media/query-heavy sections, it matches or beats the RSC baseline on first-load production measurements and is smaller during long sessions for docs, examples, and blog navigation.

The important correction from the first SSR pass: plain SSR without timing gates can eagerly schedule too much below-fold media. Lighthouse exposed this immediately on home and Query landing. Adding `Hydrate` around home social proof, home community, landing community, and sponsor pack sections fixed that without bringing back the RSC pipeline.

## Architecture delta

- RSC disabled in `vite.config.ts`; `@vitejs/plugin-rsc` removed.
- Redact is always enabled for this matrix.
- Markdown/docs/blog now move raw markdown/source data through normal server functions, then render locally with `@tanstack/markdown` and `@tanstack/highlight`.
- Deleted RSC markdown/code rendering files, RSC landing-code-example server function, and RSC heading context.
- Landing code examples are static route/component data, not rendered RSC payloads.
- Targeted `Hydrate` timing remains only as byte scheduling for below-fold sections.

Code size/complexity:

| Metric                       |                                           Result |
| ---------------------------- | -----------------------------------------------: |
| Source diff                  |                          113 files, +920 / -3946 |
| Current SSR client dist      |                                      92,258.3 KB |
| RSC baseline client dist     |                                      92,687.6 KB |
| Remaining RSC references     |                                             none |
| Remaining `use client` files | `CopyPageDropdown.tsx`, `CopyMarkdownButton.tsx` |

## Markdown and Highlight package story

The original reason RSC helped tanstack.com was real: our docs/blog path was making the browser pay for markdown rendering and Shiki. The earlier performance work measured about 1.1 MiB of script transfer on a docs page, with about 358 KiB clearly tied to syntax highlighting alone: Shiki, its WASM/runtime pieces, themes, and language chunks. The RSC migration solved that by moving markdown and code rendering back to the server, and the RSC launch post recorded the client JS graph dropping about 153 KB gzip on docs/blog pages and about 40 KB gzip on docs example pages.

This SSR pass keeps the same underlying bet, but changes the implementation. Instead of using RSC as the mechanism that hides the markdown/highlight cost from the client, we made the markdown/highlight cost small enough to ship normally, then moved only raw markdown/source data through Start server functions. That is the real byte story: with the custom markdown/highlight libraries in place, SSR is a net negative on first-load gzip across the measured content pages, `Hydrate` fixes the byte scheduling problem for below-fold sections, and long sessions compound the win because each navigation reuses the renderer already sitting in the client bundle instead of transferring rendered Flight output again.

Current packages in this worktree:

| Package                          | npm unpacked size | Files | Notes                                                                  |
| -------------------------------- | ----------------: | ----: | ---------------------------------------------------------------------- |
| `@tanstack/highlight@0.0.2`      |          80.6 KiB |    62 | tiny tokenizer/highlighter, class-based output, isolated theme exports |
| `@tanstack/markdown@0.0.4`       |          79.2 KiB |    44 | parser/rendering path for the markdown subset tanstack.com needs       |
| Combined TanStack packages       |         159.8 KiB |   106 | no runtime dependencies, React is a peer for markdown                  |
| Shiki 4.0.2 direct package graph |         10.49 MiB | 1,725 | `shiki` plus direct `@shikijs/*` packages and `vscode-textmate`        |

That package-size comparison is npm unpacked size, not browser transfer. The browser transfer fact we already have is the old 358 KiB docs-page script cost tied to Shiki. The package fact is still useful for the post because it shows how much general-purpose machinery we stopped depending on: the Shiki package graph is about 67x larger than the two new TanStack packages combined before app bundling even starts.

The current highlight integration is also simpler than the old Shiki path:

- one highlighted HTML tree, not duplicated light/dark markup,
- no inline token styles,
- theme CSS generated from `createThemeCss`,
- light mode uses `githubLightTheme`,
- dark mode uses `auroraXTheme`,
- docs smoke test found 20 `pre.th-code` blocks, 381 token spans, 0 `pre.shiki` blocks, and 0 inline token styles.

The blog angle should be framed carefully: AI helped make it practical to write purpose-built packages quickly, but the win is not "AI wrote magic." The win is that we replaced a broad markdown plus Shiki stack with small libraries designed around the exact rendering contract we need, then measured whether that was enough to remove the RSC pipeline without giving back the performance. So far, the answer is yes for the tested pages, with one important caveat: these packages are young enough that conformance matters. We found a tight-list regression in `@tanstack/markdown` where Related Resources rendered as `<li><p>...</p></li>`, fixed that link-list case in `@tanstack/markdown@0.0.4`, and found an image-sizing regression in the site wrapper around markdown images. The future post should include that part too, because the cost of going tiny is owning the test suite.

Remaining markdown package issue: `@tanstack/markdown@0.0.4` still marks some tight lists as loose when the list is followed by another block. Minimal repro:

````md
Call server functions from:

- **Route loaders** - Perfect for data fetching
- **Components** - Use with `useServerFn()` hook

```tsx
const x = 1
```
````

Expected: direct `<li><strong>Route loaders</strong> ...</li>` items. Current output: `<li><p><strong>Route loaders</strong> ...</p></li>`. This is not a tanstack.com CSS issue, and the temporary `li > p` styling workaround was removed.

## First-load HTML + JS/CSS

Production servers, local Node, `.env.local` copied from the main checkout. This table counts HTML plus scheduled local JS/CSS assets. It excludes images/fonts because those are better captured by Lighthouse byte weight.

| Page                                                 | RSC total gzip | SSR + Hydrate total gzip |    Delta | RSC HTML gzip | SSR HTML gzip | Asset gzip delta |
| ---------------------------------------------------- | -------------: | -----------------------: | -------: | ------------: | ------------: | ---------------: |
| `/`                                                  |       589.3 KB |                 586.7 KB |  -2.6 KB |       88.2 KB |       36.1 KB |         +49.5 KB |
| `/query/latest`                                      |       609.5 KB |                 592.6 KB | -16.9 KB |      106.9 KB |       47.9 KB |         +42.2 KB |
| `/form/latest`                                       |       593.7 KB |                 579.9 KB | -13.8 KB |       95.0 KB |       39.0 KB |         +42.2 KB |
| `/router/latest`                                     |       593.5 KB |                 594.3 KB |  +0.8 KB |       89.7 KB |       36.0 KB |         +54.6 KB |
| `/router/latest/docs/overview`                       |       582.7 KB |                 568.8 KB | -13.8 KB |       91.4 KB |       37.7 KB |         +39.9 KB |
| `/router/latest/docs/framework/react/examples/basic` |       601.2 KB |                 585.9 KB | -15.3 KB |       97.1 KB |       37.5 KB |         +44.3 KB |
| `/blog/tanstack-table-v9-typescript-performance`     |       596.2 KB |                 585.4 KB | -10.8 KB |      106.7 KB |       45.3 KB |         +50.6 KB |

Interpretation: SSR cuts roughly 52-61 KB gzip from HTML on every tested page. It adds 40-55 KB gzip of JS/CSS because the client now owns markdown/code rendering. Net first-load gzip is better on every tested page except Router landing, where it is effectively flat.

## Long-session navigation payloads

These are direct `_serverFn` payloads with Start's real Seroval encoding. This is the cleanest test of the theory that long sessions should favor SSR because the client already has the shared rendering logic.

| Payload                      | RSC gzip | SSR gzip |   Delta |
| ---------------------------- | -------: | -------: | ------: |
| Home recent posts            |   0.7 KB |   0.7 KB |  0.0 KB |
| Router docs config           |   2.2 KB |   2.2 KB |  0.0 KB |
| Query landing code example   |   4.6 KB |   0.0 KB | -4.6 KB |
| Router docs overview content |   5.2 KB |   3.7 KB | -1.5 KB |
| Router example directory     |   0.6 KB |   0.6 KB |  0.0 KB |
| Router example initial file  |   5.6 KB |   1.5 KB | -4.1 KB |
| Heavy blog post content      |  15.0 KB |   9.4 KB | -5.6 KB |

The RSC payloads contain `contentRsc` and rendered code markers. The SSR payloads contain raw markdown/source data only. Shared config and normal JSON data are identical between variants.

## Lighthouse desktop

Lighthouse 13.4.0, local Chrome, desktop preset, production servers. Treat these as directional local lab numbers, not final PSI numbers.

| Page                                             | RSC score | SSR + Hydrate score | RSC FCP | SSR FCP | RSC LCP | SSR LCP | RSC CLS | SSR CLS | RSC byte weight | SSR byte weight |
| ------------------------------------------------ | --------: | ------------------: | ------: | ------: | ------: | ------: | ------: | ------: | --------------: | --------------: |
| `/`                                              |        67 |                  72 | 2245 ms | 2288 ms | 3305 ms | 2728 ms |   0.000 |   0.000 |       6493.3 KB |       3253.9 KB |
| `/query/latest`                                  |        72 |                  73 | 2442 ms | 2362 ms | 2562 ms | 2462 ms |   0.000 |   0.000 |       3190.4 KB |       2625.3 KB |
| `/router/latest/docs/overview`                   |        75 |                  75 | 2202 ms | 2202 ms | 2422 ms | 2382 ms |   0.000 |   0.000 |       3493.3 KB |       2642.5 KB |
| `/blog/tanstack-table-v9-typescript-performance` |        70 |                  75 | 2321 ms | 2202 ms | 2421 ms | 2342 ms |   0.116 |   0.000 |       4197.5 KB |       2776.2 KB |

The pre-Hydrate SSR pass was misleading: home was 18,670.7 KB byte weight and Query was 11,562.6 KB because recent blog headers, partner assets, sponsor data, and GitHub avatars were eagerly scheduled. The current SSR + Hydrate pass removes that regression.

## Hydration/navigation smoke

Production SSR server on a clean port:

- Loaded `/router/latest`.
- Clicked the real `/router/latest/docs/overview` link in the browser.
- URL and title updated to the docs overview page.
- Clean server log showed no document `GET /router/latest/docs/overview`; it showed only server-function requests for route data.
- Browser console warnings/errors were empty.

That does not replace a full navigation test suite, but it specifically checks the earlier concern that hydration mismatches were causing client navigations to degrade into hard navigations.

## Caveats

- These are local production numbers, not hosted PageSpeed Insights results.
- The RSC baseline temp checkout needed the same `.env.local` as this worktree; without it, library/docs routes fell into fallback paths and measurements were invalid.
- Local Lighthouse includes image optimization behavior from the local Netlify image shim, so byte-weight direction is useful but production CDN numbers still need confirmation.
- Hydrate boundaries should stay targeted. They are useful for byte scheduling below the fold, not as a replacement for fixing hydration mismatches or CLS.

## Decision

Keep moving toward the simple SSR architecture:

- no RSC build pipeline,
- raw markdown/source over server functions,
- tiny fast markdown/highlight libraries on the client path,
- targeted `Hydrate` timing for below-fold media/query work,
- deploy-preview PSI/Lighthouse before merging.
