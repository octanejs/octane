# Source Code Audit - 2026-06-23

Status: living audit report. Scope covers the source inventory, static scans, full `src/routes` pass, `src/libraries` metadata, `src/styles`, API/server-function boundaries, auth/OAuth repositories and flows, builder endpoints, builder client/deploy UI, application-starter paths, `src/components` domain passes including landing, shop, game, stats, docs, admin/community, SearchModal/AiDock, LibraryLayout/docs chrome, partner/sponsor, stack, CodeExplorer/FileExplorer, query/hooks/client data helpers, MCP transport/tools, CLI auth tickets, scheduled tasks, shared cache/db/runtime/Sentry/env helpers, UI primitives, image helpers, contexts/stores, Vite/Start/test config, scripts, and existing tests. Excludes `node_modules`, generated route tree findings, blog prose findings, images/assets, and packaged starter template files.

The repo is large: roughly 145k hand-written TS/TSX lines under `src`, plus tests and scripts, with the largest files concentrated in search, navigation/layout, stats, builder, docs, admin/community flows, partners, and the game.

## Merged Fix Order

This is ordered by easy or quick work that also makes later fixes safer. Severity still overrides the queue when needed, so a P1 can jump the line, but this is the default sequence for batching.

Tracking model: work this list top to bottom. Leave untouched bullets plain, prefix the active one with `[doing]`, completed ones with `[done YYYY-MM-DD: verification]`, and skipped/deferred ones with `[defer: reason]`. Add one short entry to the batch log when a batch lands.

### 1. Small shared guardrails

These are quick, high-leverage patches because later fixes can reuse them instead of adding another local workaround.

- [done 2026-06-24: `pnpm run test:unit`, `pnpm test`] Make `pnpm test` honest about TypeScript tests, or split script names so validation expectations are clear.
- [done 2026-06-24: `pnpm run test:tsc`, `pnpm run test:lint`] Default non-submit buttons/select triggers to `type="button"`, fix the shared pagination label/id contract, and clean up tooltip child prop merging.
- [done 2026-06-24: `pnpm run test:unit`, `pnpm run test:tsc`, `pnpm run test:lint`] Add tiny helpers for response filenames, package slug encoding, and row-local ids.
- [done 2026-06-24: `pnpm test`, 60-route local smoke] Add tiny helpers for external URL normalization, internal route classification, and guarded storage.
- [done 2026-06-24: `pnpm test`, 60-route local smoke] Share low-risk clipboard/copy-state timers and auth popup centering.
- Fix custom `useMutation` stale callbacks, docs sidebar timers, remaining popup blocked-state handling, and remaining page-visibility/reduced-motion call sites.
- [done 2026-06-24: `pnpm test`, 60-route local smoke] Normalize maintainer bare-domain URLs, add Scarf/social URL contract tests, and centralize the public-library selector.
- Normalize partner analytics seed buckets, blog image URLs, and host cache purge response policy.

### 2. One-off cleanup that lowers noise

Do these early when they're obvious and isolated, but don't let them block higher-leverage guardrails.

- Fix Twoslash invalid CSS, duplicate shop fonts, shop `NEW` badge duration, app-starter dead selection parameter, app-starter schema caveat, Netlify pending state, mobile merch loading, sponsor tooltip math, Stack category fallbacks, and unsupported admin timestamp formatting.
- Remove or quarantine dead code once confirmed: old logo copies, unused account feedback component, showcase helper duplicates, unused shop promo components, deprecated `reactChartsProject`, and the old R3F scene/dependencies if we're ready to delete them.
- Lazy-load obvious bundle leaks with low behavior risk: Start/Router landing prompt resolver and navbar merch product loading.

### 3. Fast security and public-boundary hardening

These are small enough to do before deeper refactors and they reduce risk while larger helpers are being designed.

- [done 2026-06-24: `pnpm test:tsc`, `pnpm test:lint`, `pnpm test`] Analytics proxy header allowlist, GitHub webhook fail-closed secret, Cloudflare-first IP extraction, route response filename sanitizing, Discord raw-body size/signature-shape guard, MCP transport content-type/length guard and masked errors.
- [done 2026-06-24: `pnpm test:tsc`, `pnpm test:lint`, `pnpm test`] Public pagination and route-search caps, admin pagination/range caps, docs feedback content caps, showcase field/array caps, Shopify page-size/quantity/discount caps, UploadThing client preflight caps, image transform clamps, community-resource frontmatter schema.
- [done 2026-06-24: `pnpm test:tsc`, `pnpm test:lint`, `pnpm test`] URL/link hardening: Intent metadata URLs, Intent tarball source paths, markdown/source/search link classification, legacy redirect segment matching, local docs path containment.
- [done 2026-06-24: `pnpm test:tsc`, `pnpm test:lint`, `pnpm test`] OAuth/login quick fixes: return-to key mismatch, login modal stale callbacks, provider route param picklists, session revocation conflict retry, and session base64 fallback removal once covered.

### 4. Small controllers that prevent repeat bugs

These are still bounded, but they should come before domain cleanup so every domain fix uses the same shape.

- Route-scoped pagination controller with request fingerprints for shop, search, admin lists, stats, and any accumulated-page UI.
- Query-key completeness helper or lint pattern for related showcases, current-user data, npm recent downloads, GitHub stats, and cache field preservation.
- Optimistic mutation controller for showcase voting, feedback updates, keyed row actions, and cart/update flows.
- Browser effect toolkit for storage, timers, outside-click, drag/resize, clipboard, popup polling, window-open, and page visibility.
- Product option/color helper for shop cards, drawers, product pages, swatches, variant resolution, and preload budgets.

### 5. Domain hardening with shared primitives in place

At this point the repeatable helpers exist, so these PRs should be smaller and more reliable than fixing every route in isolation.

- Stats: public npm fan-out caps, stats UI bounds, partial recent-cache semantics, baseline math, scheduled 429 backoff/deadlines, admin cache budgets, chart range caps, and d3/date-helper split.
- Builder/application starter: selected-framework validation, URL/store feature parsing, custom template/add-on contract, ecommerce template preservation, response parsing, transient feedback, nested feature-card links, and API endpoint guard alignment.
- Showcase/feedback: concurrent first-vote handling, query keys, submission/rank caps, moderation notification handling, detail/admin error states, audit target ids, leaderboard SQL aggregation, docs feedback cache/update helper.
- Shop: Storefront caps, trusted HTML policy, image transform helper, load-more fingerprints, variant option resolution, quick-view modal semantics, nested product-card interactions, preload budgets, cart optimistic shape, and mutation-backed success state.
- Admin: capability validators, all-table role/user queries, stale bulk selections, keyed row actions, invalidation scope, dashboard lazy tabs, route/server guard sync, and transaction boundaries where the write surface is small.
- Docs/markdown: frontmatter resilience, raw HTML/iframe trust policy, tab state parsing/recovery, remote docs config caps, recursive-tree truncation handling, and manifest/cache budgets.
- Game: progression/restored counts, compass/AI island sets, NaN guards, health flash, persistence ownership, async disposal checks, culling children, and geometry ownership.

### 6. Larger boundary refactors

These need design notes first, but the earlier guardrails should make the migration less risky.

- One builder API request/response contract across compile, validate, download, deploy, remote loads, feature artifacts, suggestions, MCP, and client generation.
- One outbound fetch policy with timeout, status, content-type, response-size, redirect, and header rules for OAuth, GitHub, docs, Tranco, stats, Intent, Shopify, remote builder loads, and scripts.
- Intent ingestion redesign: remove public-read ingestion, add tarball budgets, failed-version backoff/dead-letter state, transactional skill replacement, admin process/list caps, complete GitHub discovery, and safe source paths.
- Auth/OAuth storage model: atomic authorization-code consumption, dynamic client registration persistence, client-id to redirect-uri binding, OAuth user/account upsert transaction, plaintext token migration.
- Docs manifest/cache system: recursive tree completeness, file-count/concurrency budgets, redirect metadata caching, stale fallback completeness, local path guards, and cache admin budgets.
- MCP and CLI auth: durable CLI tickets, public-create limits, rate-limit uniqueness by identifier type, cleanup by window size, API-key lifecycle caps, and lower `lastUsedAt` write amplification.
- Search/AI and LibraryLayout: split expensive imports, dock/modal state, Kapa/chat persistence, source-link routing, docs nav/tabs/mobile/sponsors/feedback, and route data boundaries.
- Partner/sponsor/catalog and shop storefront boundaries: split serializable metadata from assets/JSX, centralize public catalog visibility, remove sponsor duplication, and unify shop product/cart contracts.
- Environment/observability/runtime: consolidate env readers, Sentry PII/sample-rate policy, production diagnostics behavior, database context proxy, and script runtime budgets.

### 7. Product-wide initiatives and upstream candidates

Treat these as tracked initiatives, not normal cleanup PRs.

- Product landing shell and library landing route factory.
- UI primitive consolidation across root and shop.
- Route/module boundary cleanup and shared validation schema system.
- Admin table/filter framework and docs feedback DOM primitive.
- Deploy-dialog controller and browser effect toolkit.
- Bundle-boundary program with reachability checks, global-shell lazy panels, partner asset split, AI/search split, d3/Plot splits, navbar merch lazy import, and old R3F dependency removal.
- Upstream candidates: TanStack Start API-boundary helper, outbound fetch helper, OAuth PKCE/code-consumption helper, Drizzle transaction/audit helper, route search hydration helper, endpoint request/response schema helper, package slug codec, docs manifest builder, npm download chunk cache, Shopify image helper.
- First AI skills to actually build: API hardening, outbound fetch hygiene, route param boundaries, query-key completeness, type-safety sweep, bundle hotspot splitting, UI primitive form defaults, and route reachability/dead-stack cleanup.

## Batch Log

- 2026-06-24: Landed the grouped security pass across public request boundaries, OAuth/login/session flows, builder/GitHub deploy APIs, outbound fetches, stats/Intent/docs/shop/showcase caps, UploadThing/image preflight, markdown/search link classification, docs redirects/path containment, and community-resource frontmatter validation.
- 2026-06-24: Second pass simplified the security patch by sharing bounded body readers, npm package-name/page/date/chart schemas, and URL normalization; removed the local application-starter request guard while preserving same-origin/content-type/body-size enforcement.
- 2026-06-24: Added shared response filename/content-disposition helpers, package route slug encoding helpers, and row-local id helpers; wired them into builder/docs downloads, Intent registry links, and moderation note inputs.
- 2026-06-24: Hardened shared UI primitives: defaulted shop buttons and shared select triggers to non-submit buttons, gave pagination a unique page-size label/id pair plus non-submit controls, and made Tooltip merge trigger handlers/refs without `any`.
- 2026-06-24: Added `test:unit` and wired it into `pnpm test` so existing TypeScript assertion tests run in the default validation path.
- 2026-06-24: Added guarded browser storage/effect helpers, migrated low-risk clipboard/timer/popup/storage/reduced-motion call sites, centralized public-library selection, normalized maintainer URLs, and added static data contract tests.
- 2026-06-23: Audit created and ordered.

## Highest Priority Findings

### P0/P1 - Analytics proxy forwards private request headers

`src/server.ts:85-112` proxies same-origin analytics paths to Google and passes `headers: request.headers` directly at `src/server.ts:101-104`.

Same-origin browser requests can include cookies such as session cookies and may include authorization-like headers. Forwarding the whole inbound header bag to Google is unnecessary and risky.

Suggested fix:

- Build a fresh `Headers` allowlist for analytics upstream requests.
- Never forward `cookie`, `authorization`, `host`, `cf-*`, `x-forwarded-*`, or internal headers.
- Consider allowing only `accept`, `accept-language`, `user-agent`, and content headers needed by collect POSTs.

### P1 - OAuth authorization codes are not consumed atomically

`src/auth/oauthClient.server.ts:168-238` reads an authorization code, validates expiry/redirect/PKCE, deletes it at `src/auth/oauthClient.server.ts:205-208`, then inserts access and refresh tokens.

Two concurrent exchanges can read and validate the same code before either delete wins. Both can mint tokens. The schema has a unique `codeHash`, but that only prevents duplicate codes, not concurrent reuse.

Suggested fix:

- Use a transaction and atomically delete/claim by `codeHash` plus validity conditions, returning the row.
- Alternatively add a `consumedAt` field and update `where consumedAt is null returning`.
- Only mint tokens after a single request has proven it owns the code.

### P1 - OAuth client IDs are not bound to registered redirect URIs

`src/routes/oauth/register.ts:28-80` accepts dynamic client metadata, validates submitted redirect URIs, then returns a deterministic client id from `client_name` at `src/routes/oauth/register.ts:113-127`. The registration is not stored. Later, `src/routes/oauth/authorize.tsx:38-93` and `src/utils/oauthClient.functions.ts:48-79` only validate that the requested redirect URI is localhost or HTTPS; they do not verify that the `client_id` owns that redirect URI.

The authorize UI displays `Authorize {displayClientId}` at `src/routes/oauth/authorize.tsx:241-254` but does not show the redirect origin. A crafted authorization link can therefore use a familiar-looking client id with a different HTTPS redirect URI.

Suggested fix:

- Store dynamic client registrations with redirect URI allowlists, client display names, and created timestamps.
- Require authorize/token flows to match `client_id + redirect_uri` against the stored registration.
- Add client-name, redirect-uri count, redirect-uri length, state, scope, and PKCE length caps.
- Show the redirect origin/app name in the consent screen.

### P1 - Client IP extraction trusts spoofable headers before Cloudflare

`src/utils/request.server.ts:21-34` checks `x-forwarded-for`, then `x-real-ip`, then `cf-connecting-ip`.

On Cloudflare-hosted traffic, `cf-connecting-ip` should be the trusted source. Taking `x-forwarded-for` first can let clients spoof IP identity for rate limits, audit/logins, MCP limits, and any future IP-based guard.

Suggested fix:

- Prefer `cf-connecting-ip` on Cloudflare.
- Only trust `x-forwarded-for` from known proxy paths.
- Normalize and validate IP shape before using it as a rate-limit key.

### P1 - Public npm stats requests can cause unbounded fan-out

`src/utils/stats-queries.functions.ts:12-33` uses typed pass-through validators for public bulk npm stats input. `src/utils/stats.server.ts:470-646` turns those values into per-package, per-range chunk requests and runs missing chunks with `Promise.all` at `src/utils/stats.server.ts:549-646`.

The stats UI route schemas do not cap package counts, string length, or date span tightly enough. Examples include `src/routes/stats/npm/-comparisons.ts:3-13`, `src/routes/stats/npm/-utils.ts:44-47`, `src/routes/stats/npm/index.tsx:57-86`, and `src/routes/stats/npm/$packages.tsx:15-23`. A public request can fan out to many npm API requests, Blob storage listings, and DB cache operations.

`src/utils/npm-download-cache.server.ts:368-390` also lists all Blob objects under a prefix with page size `1000` but no page/object cap. That is called from latest-chunk lookups at `src/utils/npm-download-cache.server.ts:560-607` and `src/utils/npm-download-cache.server.ts:636-691`, so a large package set can turn into many unbounded storage-list operations.

The DB fallback has the same scaling shape. `src/utils/stats-db.server.ts:1347-1382` and `src/utils/stats-db.server.ts:1422-1459` build one `or(...)` predicate per requested chunk, so uncapped input can create a huge SQL predicate before npm fetches even start. The newer Blob helper also runs storage/cache reads with unbounded `Promise.all` at `src/utils/npm-download-cache.server.ts:506-555`, `src/utils/npm-download-cache.server.ts:560-631`, and `src/utils/npm-download-cache.server.ts:636-715`.

The authenticated MCP npm stats tool caps `packages` at 10 in `src/mcp/tools/npm-stats.ts:19-43`, but package/library/preset strings are still loose and flow into the same stats code at `src/mcp/tools/npm-stats.ts:163-176`.

Suggested fix:

- Add a shared runtime schema for npm stats queries.
- Cap package group count, packages per group, package name length/pattern, and max date window.
- Add concurrency limiting for npm fetches.
- Cap cache batch sizes and split large chunk lookups into bounded pages.
- Add page/object caps to npm download-cache Blob listings.
- Add per-IP or per-session limits for public bulk stats calls.

### P2 - NPM stats UI search state is unbounded too

The backend fan-out issue is mirrored at the route/search layer. `src/routes/stats/npm/index.tsx:57-86` and `src/routes/_library/$libraryId/$version.docs.npm-stats.tsx:66-93` accept `packageGroups` arrays through URL search without max lengths, and `height` is just `v.number()` with no min/max. The slug redirect route parses unlimited package lists from `params.packages` at `src/routes/stats/npm/$packages.tsx:24-27` via `src/routes/stats/npm/-utils.ts:43-47`, then turns them into search `packageGroups` at `src/routes/stats/npm/$packages.tsx:91-101`. The shared `packageGroupSchema` at `src/routes/stats/npm/-comparisons.ts:3-13` also accepts arbitrary package names, color strings, and baseline labels.

Result: a crafted stats URL can create a huge query string, oversized React Query key, large server-function payload, and a pathological chart container height before backend guards have a chance to help.

Suggested fix: move npm stats route/search schemas into `src/components/npm-stats/shared.ts` or a dedicated `src/utils/npm-stats-schema.ts`, cap total packages/groups, validate npm package names, trim labels/colors, and clamp chart height to a sane range.

### P2 - NPM stats baseline normalization can corrupt relative change

`src/components/npm-stats/NPMStatsChart.tsx:219-233` captures `firstDownloads` before baseline normalization, then mutates each point's `d.downloads` in place when `normalizeByBaseline` is active. The returned `change` value subtracts the raw first download count from the normalized current value.

That means the "Relative Change" transform can be wrong whenever baseline normalization is active: the y-value mixes two units. The in-place mutation also makes this block harder to reason about because the original binned point object is no longer raw after the first normalized pass.

Suggested fix: compute `normalizedDownloads` as a local value, compute `firstNormalizedDownloads` with the same divisor policy, and return a fresh `{ ...d, downloads: normalizedDownloads, change: normalizedDownloads - firstNormalizedDownloads }` object without mutating the binned point.

### P2 - Recent npm stats can return partial totals from partial cache hits

`src/utils/npm-download-cache.server.ts:636-717` returns a map of the package names that have a covering cached chunk; it is intentionally partial when some packages miss both Blob and legacy cache. `src/utils/stats.server.ts:974-1023` treats `latestCachedChunks.size > 0` as a complete hit and returns aggregate daily/weekly/monthly totals using only the cached chunks.

For a library with multiple packages, one cached package and one missing package can undercount all recent download totals while still looking fresh.

Suggested fix: only take the fast path when `latestCachedChunks.size === packageNames.length`, or merge cached package results with bounded fetches for the missing package names before returning.

### P1/P2 - Scheduled NPM stats refresh can hang forever on 429s

The scheduled all-time package fetch loops until a chunk succeeds. `src/utils/stats.functions.ts:266-355` uses `while (!success)` and, for npm `429`, waits five seconds and retries the same chunk with no attempt cap, wall-clock deadline, or abort signal. `fetchSingleNpmPackageFresh` adds outer retries at `src/utils/stats.functions.ts:375-435`, but the inner 429 loop can prevent those retries from ever advancing.

`computeNpmOrgStats` then runs package refreshes through an `AsyncQueuer` at `src/utils/stats.functions.ts:517-569`, so one stuck package chunk can hold the whole org refresh. The admin trigger reaches this path through `src/utils/stats-admin.server.ts:367-375`.

Suggested fix: add a bounded retry policy for npm chunk fetches, use `AbortSignal.timeout`/a task deadline, record partial failures explicitly, and let the scheduled refresh finish with a degraded result instead of waiting indefinitely.

### P1 - Builder API endpoints do not share request guards

`src/routes/api/builder/compile.ts:6-32`, `compile-attributed.ts`, `validate.ts`, `suggest.ts`, `feature-artifacts.ts`, `download.ts`, `load-template.ts`, `load-remote-template.ts`, and `load-remote-addon.ts` read JSON/query input directly and do not share one request guard/schema. Some apply the builder rate-limit preset, but content-type, content-length, same-origin, filename, and response-error policy are still inconsistent.

`RATE_LIMITS.builderCompile` exists in `src/utils/rateLimit.server.ts`, and `src/routes/api/application-starter/resolve.ts:80-166` already shows a stronger pattern with rate limits, body guards, content-type checks, same-origin checks, schema parsing, and cache headers.

Specific risks:

- `src/routes/api/builder/compile.ts:8-22` reads arbitrary JSON and only checks that `definition` exists.
- `src/routes/api/builder/download.ts:21-88` accepts raw query values and uses raw `name` for `zip.folder(name)` and `Content-Disposition`.
- Error responses expose internal exception messages in several builder endpoints.

Suggested fix:

- Create a shared builder request schema and parse every entrypoint through it.
- Apply `RATE_LIMITS.builderCompile` or a more specific preset.
- Add content-type, content-length, and same-origin guards.
- Sanitize project names and response filenames.
- Return stable public error codes and log internal details separately.

### P1 - Remote builder loads have allowlist checks but no fetch budget

`src/builder/api/remote.ts:101-104` fetches remote template JSON with no timeout, status check, content-type check, or response-size limit. `src/builder/api/remote.ts:125-127` delegates remote add-ons to `loadRemoteAddOn`.

`src/utils/url-validation.server.ts` is a good SSRF/host allowlist, but allowed CDN URLs can still hang workers or return huge responses. The validation also happens before `fetch`; `src/builder/api/remote.ts:101-103` uses the default redirect-following behavior and does not revalidate the final response URL, so an allowed host redirect can bypass the initial host check.

Suggested fix:

- Add a central `fetchJsonWithLimit` helper with `AbortSignal.timeout`, byte cap, content-type guard, status guard, and JSON parse errors.
- Use `redirect: 'manual'` or revalidate every redirect/final URL against the same allowlist.
- Use it for remote templates and any remote add-on path that allows user-provided URLs.

### P1 - GitHub docs webhook fails open when the secret is unset

`src/routes/api/github/webhook.ts:67-85` only verifies the GitHub signature when `env.GITHUB_WEBHOOK_SECRET` is present. If the secret is missing, any public POST can send a watched repo/ref payload, mark docs/content cache rows stale at `src/routes/api/github/webhook.ts:136-139`, and trigger cache purge at `src/routes/api/github/webhook.ts:151`.

Suggested fix:

- Fail closed in production if `GITHUB_WEBHOOK_SECRET` is missing.
- Return a clear deploy/config error instead of accepting unsigned webhooks.
- Add a content-length cap before `request.text()`.
- Consider validating event id/delivery headers for replay diagnostics.

### P1 - Intent package detail performs npm ingestion on the public request path

`src/utils/intent.functions.ts:422-435` accepts any string package name and, when the package is missing locally, calls `inlineSeedPackage`. That path fetches npm metadata, downloads the latest tarball, extracts skills, writes package/version rows, and stores skill content at `src/utils/intent.functions.ts:304-396`.

This turns an unauthenticated read endpoint into a package-ingestion worker. It also uses an unbounded in-memory `rejectedPackages` map keyed by arbitrary request strings at `src/utils/intent.functions.ts:247-260`.

Suggested fix:

- Validate package names with a shared npm package-name schema and length cap.
- Do not process unknown packages inline from public detail requests.
- Queue unknown packages for bounded background processing, or require admin/manual seeding.
- Add per-IP/session rate limits for public Intent registry misses.
- Cap or replace the local rejection cache with bounded cache infrastructure.

### P1 - Intent tarball extraction has no time or size budget

`src/utils/intent.server.ts:293-358` fetches a package tarball with no timeout, compressed-size cap, decompressed-size cap, entry-count cap, or per-file cap. Matching `SKILL.md` files are buffered fully at `src/utils/intent.server.ts:336-340`.

Any npm package that reaches Intent discovery, admin seeding, scheduled queue processing, or the public inline-seed path can force large stream work. The scheduled GitHub discovery path also extracts a tarball inline before enqueueing at `src/server/scheduled.server.ts:230-331`, so the expensive tarball path is not isolated to the bounded queue processor.

Suggested fix:

- Fetch tarballs with an abort timeout and content-length cap.
- Enforce max decompressed bytes, max tar entries, max skill files, and max bytes per `SKILL.md`.
- Abort the pipeline as soon as any cap is exceeded.
- Store the caps in one reusable ingestion policy object.

### P1/P2 - Public Intent registry queries lack request caps

`src/utils/intent.functions.ts:104-240` accepts uncapped `search`, `framework`, `page`, and `pageSize`, then may call npm search and fetch versions/skills for every verified package. The default npm discovery helper also pages until npm's reported total ends at `src/utils/intent.server.ts:89-111`, with no page cap or deadline. `src/utils/intent.functions.ts:595-600` accepts uncapped skill-search limits. `src/utils/intent.functions.ts:697-735` accepts an uncapped `packageNames` array and fans out through `Promise.all`. The package-history paths have the same shape: `src/utils/intent.functions.ts:799-828` accepts an uncapped changelog `limit`, and `src/utils/intent.functions.ts:966-1007` walks every version for one skill with no limit. The package route also accepts unbounded `expanded` and `expandedSkills` URL arrays at `src/routes/intent/registry/$packageName.tsx:53-58`, then feeds them into sets and URL writes at `src/routes/intent/registry/$packageName.index.tsx:80-101` and `src/routes/intent/registry/$packageName.index.tsx:163-177`.

Suggested fix:

- Add shared public Intent query schemas with max query length, page size, page number, package count, package-name length, and history limit.
- Prefer precomputed directory rows for list pages instead of per-package version/skill lookups in the request path.
- Apply bounded concurrency where fan-out remains necessary.

### P3 - Intent dependency graph uses a fixed SVG marker id

`src/components/intent/SkillDependencyGraph.tsx:168-176` defines `<marker id="arrowhead">`, and every dependency line references `markerEnd="url(#arrowhead)"` at `src/components/intent/SkillDependencyGraph.tsx:208-218`. If two dependency graphs ever render on the same page, the marker id collides across SVGs and references can resolve to the first definition.

Suggested fix: generate the marker id with `React.useId()` and reference `url(#${markerId})`, or accept a stable id prefix from the parent if the graph needs deterministic screenshots.

### P2/P3 - Intent package metadata URLs are rendered without URL normalization

Intent package detail pages render package metadata from npm. `src/utils/intent.functions.ts:273-284` builds `repositoryUrl` from `latestMeta.repository` by stripping `git+` and `.git`, but does not parse the URL or restrict protocols. Directory rows also pass through npm-provided homepage/repository/npm links at `src/utils/intent.functions.ts:198-204`.

The package layout renders `detail.repositoryUrl` directly as an external anchor at `src/routes/intent/registry/$packageName.tsx:257-264`. A package's npm metadata can contain non-web protocols or malformed values, and the UI still titles the link "GitHub".

Suggested fix: normalize npm metadata URLs through a shared `normalizeExternalPackageUrl` helper that accepts only `https:` and `http:` for public anchors, converts common `git+https`/`git@github.com:` repository forms to web URLs, drops anything else, and stores a `repositoryHost`/label separately from the href.

### P2/P3 - Intent skill source links trust tarball path segments

`src/utils/intent.server.ts:319-334` accepts any tar entry matching `package/skills/**/SKILL.md` and derives `skillPath` by string replacement. It does not reject `..`, encoded separators, duplicate slashes, or odd path segments. The skill detail page then interpolates that value into an unpkg Source link at `src/routes/intent/registry/$packageName.$skillName.tsx:143-147`.

The link is external, not a local file read, so this is lower risk than extraction traversal. It still lets package-controlled tar headers produce malformed or misleading source URLs on a trusted registry page.

Suggested fix: parse tar entry names into normalized path segments before storing `skillPath`, reject traversal/empty segments, and build the unpkg URL with `new URL()` plus per-segment encoding.

### P3 - NPM-style package slugs are not round-trip safe

`decodePkgName` encodes scoped package names by replacing `/` with `__` at `src/routes/intent/registry/$packageName.tsx:29-33`. Directory links use the inverse shape with `pkg.name.replace('/', '__')` at `src/routes/intent/registry/index.tsx:556-563`, `src/routes/intent/registry/index.tsx:573-575`, and `src/routes/intent/registry/index.tsx:653-663`.

The same codec exists for NPM stats at `src/routes/stats/npm/-utils.ts:34-40`, with parsed params used by `src/routes/stats/npm/$packages.tsx:24-26`.

That delimiter is undocumented and ambiguous for any package name that already contains `__`; the route would decode the first delimiter into `/` and look up a different package. Suggested fix: use `encodeURIComponent`/`decodeURIComponent` for route params, or centralize an explicit package-name slug codec with tests for scoped, unscoped, underscore, and malformed names across Intent and stats routes.

### P3 - Maintainer social links rely on raw static URL strings

Maintainer social profile data is typed as loose strings at `src/libraries/maintainers.ts:15-20`, then rendered directly as anchor hrefs by `src/components/MaintainerCard.tsx:183-200`. One current entry already misses a protocol: `src/libraries/maintainers.ts:316-319` sets `website: 'harry-whorlow.dev'`, which renders as a relative site URL instead of an external profile link.

Suggested fix: validate static maintainer data at module load/build time or normalize it through the same external URL helper used for package metadata. The helper should either add `https://` for known bare domains or reject malformed profile URLs loudly.

## Correctness And Stability Findings

### P2 - Game persistence runs from module scope

`src/components/game/hooks/useGameStore.ts:48-53` casts parsed `localStorage` JSON to `PersistedState` without runtime validation. `src/components/game/hooks/useGameStore.ts:1000-1016` starts an interval and `beforeunload` listener at module scope when `window` exists.

This is easy to duplicate under HMR and hard to clean up. Move persistence into a mounted component/hook with teardown and schema validation.

### P2 - Game engine async initialization can attach work after disposal

`src/components/game/scene/VanillaGameScene.tsx:64-80` creates a `GameEngine`, calls async `engine.init()`, and disposes the engine on unmount. `GameEngine.start()` guards `isDisposed` at `src/components/game/engine/GameEngine.ts:700-710`, but `GameEngine.init()` itself continues after asset preload at `src/components/game/engine/GameEngine.ts:172-217` and can add scene objects, store subscriptions, and `BoatControlSystem` listeners after disposal.

The engine has the same issue after setup. `src/components/game/engine/GameEngine.ts:391-421` and `src/components/game/engine/GameEngine.ts:576-606` fetch showcase data and then mutate store/entity/ocean state from `.then(...)` callbacks without checking `this.isDisposed`. `src/components/game/engine/entities/Islands.ts:1034-1050` loads partner logo textures and adds meshes in the `TextureLoader.load` callback without knowing whether the island/info group has already been disposed. `src/components/game/engine/GameEngine.ts:674-687` also schedules an untracked `setTimeout` inside a store subscription. If the engine is disposed before any of those callbacks fire, stale work can still spawn AI or update disposed scene objects.

Smaller UI timer examples:

- `src/components/game/ui/BadgeOverlay.tsx:112-115` schedules dismiss work without cleanup.
- `src/components/game/ui/TouchControls.tsx:4-10` uses module-scope click debounce state and an untracked timeout.

Suggested fix:

- Add an abort/cancel guard to `GameEngine.init()` after every awaited preload step.
- Track and clear engine-owned timeouts in `dispose()`.
- Avoid adding systems/subscriptions/listeners after `isDisposed` is true.
- Consider making `init()` return a cleanup-capable task or accepting an `AbortSignal`.

### P3 - Game discovery confetti never uses island colors

`src/components/game/engine/entities/Islands.ts:933-949` creates the flag material with the island color but never stores that color on `flag.userData`. `spawnConfetti` reads `instance.flagGroup.userData.color || '#FFD700'` at `src/components/game/engine/entities/Islands.ts:1389-1396`, so every island falls back to gold-accent confetti instead of deriving its palette from the discovered library/partner/showcase.

Suggested fix: set `flag.userData.color = color` when the flag is created, or pass the island color through the `IslandInstance` data instead of userData.

### P2/P3 - Game island culling misses world-space children

`src/components/game/engine/entities/Islands.ts:1262-1268` distance-culls only `instance.group`. Several visible children are intentionally added directly to the top-level `Islands.group` instead of `instance.group`: lobe wave rings at `src/components/game/engine/entities/Islands.ts:253-273`, flags at `src/components/game/engine/entities/Islands.ts:422-431`, info cards at `src/components/game/engine/entities/Islands.ts:433-437`, and main wave rings at `src/components/game/engine/entities/Islands.ts:439-462`.

The update loop skips wave-ring animation when `instance.group.visible` is false at `src/components/game/engine/entities/Islands.ts:1369-1375`, but it never hides those meshes. Distant islands can therefore still render their world-space rings/flags/cards while the land mass is culled. Suggested fix: add a per-instance world-space group for rings/flag/info and cull it together, or explicitly update visibility for every detached child.

### P3 - Island flag position ignores the rotation it computes

`calculateFlagWorldPosition` computes rotated local offsets at `src/components/game/engine/entities/Islands.ts:963-972`, but returns unrotated `signOffsetX` and `signOffsetZ` at `src/components/game/engine/entities/Islands.ts:974-978`. Rotated islands therefore place flags at the same world offset instead of the rotated local flag anchor. Suggested fix: return `data.position[0] + localX * data.scale` and `data.position[2] + localZ * data.scale`, with any intentional fixed nudge named separately.

### P2 - Progression machine checks completion before counting the current discovery

The progression machine guards compare current context counts against totals at `src/components/game/machines/progressionMachine.ts:117-128`, but the transition actions increment only after the guard is evaluated. The discovery transitions repeat that shape for libraries, partners, showcases, and corners at `src/components/game/machines/progressionMachine.ts:259-265`, `src/components/game/machines/progressionMachine.ts:288-294`, `src/components/game/machines/progressionMachine.ts:304-310`, and `src/components/game/machines/progressionMachine.ts:320-326`.

The sync path sends exactly one event for the newly discovered island at `src/components/game/machines/useProgressionSync.ts:34-67` after `discoverIsland` adds the id to the store at `src/components/game/hooks/useGameStore.ts:399-415`. If the machine has `total - 1` discoveries and the player discovers the last island, the guard sees the old count, takes the non-transition branch, increments to `total`, and then waits for another discovery event that may never happen. Zustand still unlocks stages directly at `src/components/game/hooks/useGameStore.ts:421-489`, so UI/gameplay and badge machine state can diverge.

Suggested fix: make the completion guard include the incoming discovery (`context.count + 1 >= total`), or increment first and use `always` transitions to check completion from updated context. Add regression tests for `1/1` and `N/N` completions per phase.

### P2 - Restored game progress misclassifies core library islands

`GameMachineProvider` restores machine counts from `discoveredIslands` by checking id prefixes at `src/components/game/machines/GameMachineProvider.tsx:96-127`: `library-`, `partner-`, `showcase-`, and `corner-`. Core library islands are generated with the raw library id at `src/components/game/utils/islandGenerator.ts:162-168`, not a `library-*` prefix, so restored `librariesDiscovered` can stay at `0` after reload even when the player has discovered Query/Table/Router/etc.

That can leave badge/progression machine state behind the zustand gameplay state. Suggested fix: classify discoveries from the actual island collections, or share the same island-type lookup used by live discovery sync instead of inferring type from string prefixes.

### P2 - Ocean rock regeneration reuses disposed shared geometry

`OceanRocks` creates one shared `dodecahedronGeo` at `src/components/game/engine/entities/OceanRocks.ts:35-38`. `generate()` clears the previous rock set by calling `dispose()` at `src/components/game/engine/entities/OceanRocks.ts:50-53`, and `dispose()` disposes each `rock.rockMesh.geometry` at `src/components/game/engine/entities/OceanRocks.ts:210-217`. Those meshes all point at the shared `dodecahedronGeo`, but `generate()` then immediately creates new rock meshes with the same disposed geometry at `src/components/game/engine/entities/OceanRocks.ts:105-120`.

Today `GameEngine.initializeGameData()` calls `generate()` once at `src/components/game/engine/GameEngine.ts:336-357`, but the method is written as a reusable regeneration API and will break under HMR, reset/regenerate features, or any future world refresh.

Suggested fix: treat `dodecahedronGeo` like an owner-level resource and dispose it only from a final `dispose()` path, or recreate it after clearing generated groups. Per-rock cleanup should dispose only per-rock materials and cached ring geometries that are not reused.

### P2 - Game model cleanup disposes cached/shared geometry

`modelLoader.clone()` clones the cached scene at `src/components/game/engine/loaders/ModelLoader.ts:43-50` and clones only the material at `src/components/game/engine/loaders/ModelLoader.ts:56-58`. Geometry stays shared with the cached GLTF. `Boat.dispose()` then traverses the current boat model and disposes `child.geometry` at `src/components/game/engine/entities/Boat.ts:291-298`, and `AIShips.disposeShip()` does the same at `src/components/game/engine/entities/AIShips.ts:146-154`.

That means disposing one boat/AI clone can dispose geometry still owned by the loader cache or by other clones. `AIShips` has the same problem for its own cannon geometries: `createShip()` uses shared `this.cannonGeometries.base/barrel` at `src/components/game/engine/entities/AIShips.ts:49-64`, but `disposeShip()` disposes each child geometry when one AI ship is removed. The next ship can render with a disposed shared cannon geometry.

There is also an opposite leak in the same area: `Boat.setBoatType()` removes the old model from the group at `src/components/game/engine/entities/Boat.ts:75-83` but does not dispose its cloned materials before replacing it.

Suggested fix: make ownership explicit. If model geometry is shared through `ModelLoader`, instance cleanup should dispose only cloned materials/textures, not geometry. Shared cannon geometry should only be disposed in `AIShips.dispose()`. If per-instance geometry is required, deep-clone geometry at creation and keep the disposal contract local.

### P2 - Health damage flash can retrigger forever after one hit

`GameHUD` tracks `prevHealth` separately from `boatHealth` at `src/components/game/ui/GameHUD.tsx:44-45`. The damage-flash effect detects a drop at `src/components/game/ui/GameHUD.tsx:106-114`, sets `damageFlash`, and returns without updating `prevHealth`. After the 150ms timer clears `damageFlash`, `boatHealth` is still lower than the stale `prevHealth`, so the effect can schedule another flash for the same old hit. The bar can keep flashing until health is restored or another path updates `prevHealth`.

Suggested fix: update `prevHealth` whenever a new `boatHealth` value is observed, including the damage branch. A simple pattern is to compare against the previous value in a functional state update, trigger the flash as a side effect of the comparison, and always store the current health for the next render.

### P2/P3 - Game generated vectors can become NaN or infinite

`createAICannonball` computes a lead target at `src/components/game/engine/systems/AISystem.ts:314-316` and divides by `leadDist` at `src/components/game/engine/systems/AISystem.ts:318-319` without a zero guard. If the target point equals the cannon fire point after spread/lead math, the cannonball velocity becomes `NaN`, and that value is written into the shared cannonball array.

Island placement has the same shape. `generateIslands` pushes islands apart by dividing by `dist` at `src/components/game/utils/islandGenerator.ts:107-113`, and the expanded/showcase generators repeat it at `src/components/game/utils/islandGenerator.ts:315-324` and `src/components/game/utils/islandGenerator.ts:417-425`. Duplicate generated positions are unlikely, but if they happen the world coordinates can become `Infinity`/`NaN` and then flow into collisions, minimap, ocean gradients, and Three transforms.

Suggested fix: centralize a `safeNormalize2D(dx, dz, fallbackAngle)` helper for AI fire, collision push, and generator push-apart math. When distance is zero or non-finite, use a deterministic fallback vector from the seed/id instead of dividing.

### P3 - Compass shop item ignores showcase and corner islands

The active boat control system correctly includes `showcaseIslands` and `cornerIslands` in late-game collision/nearby detection at `src/components/game/engine/systems/BoatControlSystem.ts:152-156`. The compass purchase path does not: `purchaseItem('compass')` builds `allIslands` from only `islands` and `expandedIslands` at `src/components/game/hooks/useGameStore.ts:787-797`.

After showcase or corner islands unlock, a bought compass can only target core library or partner islands, so it stops helping with the current progression layer. Suggested fix: extract one `getReachableIslands(state)` helper and use it in controls, compass targeting, restart spawn selection, minimap, and counters.

The AI system has the same split in a different behavior. `src/components/game/engine/systems/AISystem.ts:409-424` builds obstacle-avoidance islands from only `islands` and `expandedIslands`, then uses that list at `src/components/game/engine/systems/AISystem.ts:554-565`. Outer-rim and boss ships can therefore ignore showcase/corner island collision pressure even though the player collides with those islands. Include AI avoidance in the shared reachable-islands helper, or expose separate `getCollidableIslands(state)` / `getCompassTargetableIslands(state)` helpers if the sets intentionally differ.

### P2 - Custom `useMutation` has stale callbacks and casts through redirects

`src/hooks/useMutation.ts:29-53` only depends on `opts.fn`, while using `opts.onSuccess`, `opts.onError`, and `opts.onSettled`. Changed callbacks can go stale. The catch path does not await `onSettled` even though the type allows a promise. `src/hooks/useMutation.ts:59` and `src/hooks/useMutation.ts:86-88` use casts.

Consider replacing this with `@tanstack/react-query` mutation helpers or tighten this hook with refs/deps and typed redirect handling.

### P2 - Tooltip clone drops/overrides child behavior

`src/components/Tooltip.tsx:43-47` clones the child with a new `ref` and `getReferenceProps()` but does not merge the child ref or pass existing child props into `getReferenceProps`.

Use the Floating UI pattern: `getReferenceProps(children.props)` and a merged ref utility.

### P2/P3 - Button and select primitives rely on native submit defaults

`src/ui/Button.tsx:129-144` creates the requested element and forwards props, but when `as` is omitted it renders a native `<button>` without defaulting `type="button"`. Any future non-submit `Button` placed inside a form will submit unless every callsite remembers to opt out.

`src/components/Select.tsx:45-68` has the same issue on its dropdown trigger. The stronger local patterns are `src/components/Collapsible.tsx:75-104` and `src/components/application-builder/parts.tsx:21-64`, which explicitly default interactive non-submit buttons to `type="button"`.

`src/components/AuthenticatedUserMenu.tsx:30-40` passes a plain `<div>` as a Radix dropdown trigger. Even if Radix adds ARIA props, this should be a real `<button type="button">` so focus, keyboard activation, disabled state, and semantics do not depend on a non-interactive element being enhanced correctly.

The shared filter primitives repeat the same risk: `src/components/FilterComponents.tsx:78`, `src/components/FilterComponents.tsx:109`, `src/components/FilterComponents.tsx:136`, `src/components/FilterComponents.tsx:180`, `src/components/FilterComponents.tsx:225`, `src/components/FilterComponents.tsx:300`, `src/components/FilterComponents.tsx:320`, `src/components/FilterComponents.tsx:392`, `src/components/FilterComponents.tsx:483`, `src/components/FilterComponents.tsx:633`, and `src/components/FilterComponents.tsx:670` render plain buttons. Current call sites are mostly admin/list toolbars, but these are reusable components and should be form-safe by default.

`src/components/PaginationControls.tsx:108-166` also renders shared navigation/page buttons without explicit button types.

Docs chrome and install cards repeat the raw-button version: `src/components/Breadcrumbs.tsx:52-60`, `src/components/Doc.tsx:161-171`, and `src/components/FrameworkCard.tsx:94-108` all render non-submit action buttons without `type="button"`.

`src/components/builder/FeaturePicker.tsx:401-420` and `src/components/builder/FeaturePicker.tsx:593-604` also render card buttons without an explicit `type`. They are not currently inside forms, but this is the same reusable-card pattern and should not depend on callsite context.

The link/button composition also drifts. `src/components/admin/AdminAccessDenied.tsx:14-16` and `src/components/admin/AdminEmptyState.tsx:34-38` wrap the shared `Button` in a TanStack Router `Link`, so the DOM becomes an anchor containing a native button. The safer local direction is one typed button-as-link/slot pattern instead of mixing outer links and inner buttons.

The shop primitives repeat the same contract drift in a product-specific skin. `src/components/shop/ui/Button.tsx:23-42` forwards native button props but does not default `type="button"`. `src/components/shop/ui/Select.tsx:32-94` advertises the same `onChange` shape as a native select, but it extracts literal `<option>` children into a custom button/listbox, cannot carry native `name`, `id`, `required`, form submission, or label semantics, and forces route callsites back into casts such as `src/routes/shop.index.tsx:175-188` and `src/routes/shop.collections.$handle.tsx:123-145`.

The npm stats controls repeat the pattern across chart dropdown triggers, package pill controls, and baseline controls: `src/components/npm-stats/ChartControls.tsx:77-291`, `src/components/npm-stats/PackagePills.tsx:64-209`, and `src/components/npm-stats/BaselineSection.tsx:56-241`.

The Button implementation also weakens type safety with `Record<string, unknown>` and an `unknown` cast at `src/ui/Button.tsx:102-117`, then casts the `forwardRef` result back to `ButtonComponent` at `src/ui/Button.tsx:104-145`.

Suggested fix: default native buttons to `type="button"` unless callers pass `type`, keep `type="submit"` explicit at submit callsites, and replace the polymorphic helper with a typed `asChild`/slot pattern or a narrower overload set.

### P3 - Stats baseline search is a custom modal without dialog semantics

`src/components/npm-stats/BaselineSection.tsx:233-258` renders a fixed full-screen overlay for "Add baseline package" with no dialog role, focus trap, Escape handling, outside-click dismissal, or focus restoration. It visually behaves like a modal, but assistive tech and keyboard users do not get the same contract as the Radix dialogs used elsewhere.

Suggested fix: use the existing Radix dialog pattern for modal overlays, or extract a small `CommandDialog`/`SearchDialog` primitive used by stats package search and future command-style pickers.

### P2 - Builder validation ignores selected framework

`src/builder/api/validate.ts:30-35` calls `getFramework()` without using `definition.framework`, while compile uses the selected framework. Solid definitions can be validated against the React add-on set.

Suggested fix: `getFramework(definition.framework ?? 'react')`, backed by the same schema used by compile/download.

### P2 - Builder URL/store path casts route strings into trusted feature ids

`src/components/builder/useBuilderUrl.ts:27-104` parses `search.name`, `search.pm`, `search.features`, and dotted feature options directly from URL search params. It narrows package managers with a local array check at `src/components/builder/useBuilderUrl.ts:59-61`, but casts URL feature strings to `Array<FeatureId>` at `src/components/builder/useBuilderUrl.ts:73-90` and casts dotted keys at `src/components/builder/useBuilderUrl.ts:94-98`.

`FeatureId` is currently just `string` at `src/builder/api/index.ts:50`, so the casts do not protect anything. `src/components/builder/FeaturePicker.tsx:593-597` also casts example ids through `any`. The store rejects unknown examples in `src/components/builder/store.ts:234-235`, but `setFeatures` at `src/components/builder/store.ts:211` can still store arbitrary URL-derived strings until downstream compile/validation catches them.

The URL/store sync is also one-shot. `src/components/builder/BuilderProvider.tsx:31-48` reads `search.framework` through a cast and applies it only during initial feature loading. `src/components/builder/useBuilderUrl.ts:45-106` hydrates the rest of search state only once after `featuresLoaded`. Browser back/forward or in-app navigation between two `/builder?...` configurations can leave the URL and Zustand store disagreeing until some later store change rewrites the URL.

Suggested fix:

- Move builder URL parsing into the same shared builder definition schema used by compile, validate, download, deploy, and MCP.
- Normalize `FeatureId` through known `availableFeatures`/`availableExamples` after feature data loads, not through casts.
- Type route search params at the route definition rather than casting `useSearch({ strict: false })`.
- Replace `FeatureId = string` with a branded/validated runtime boundary or keep it plain but never treat it as validated.
- Treat URL as an external source every time it changes, with an explicit loop-prevention strategy instead of one-time initialization refs.

### P2 - Application starter stores hidden control state in user prompt text

`src/utils/partners.tsx:266-333` defines plain text markers such as `Starter guidance:`, `Selected partner ids:`, `Inferred partner ids:`, and `Force router-only: true`, then parses them back out of the same string later. `composeApplicationStarterInput` appends those markers at `src/utils/partners.tsx:1661-1761`.

That composed string drives real behavior: `resolveApplicationStarterDeterministically` reads selected/inferred partner ids from it at `src/utils/application-starter.ts:525-536`, `detectRouterOnly` honors `Force router-only: true` at `src/utils/application-starter.ts:974-978`, and `buildPrompt` injects parsed guidance lines into the final generated prompt at `src/utils/application-starter.ts:1119-1183`.

A user brief that contains the same marker shape can therefore truncate the visible brief, force router-only mode, or inject starter guidance without going through the UI controls. It is not a remote code execution bug, but it makes the builder contract fragile and hard to reason about.

Suggested fix: carry starter metadata as structured fields (`input`, `selectedPartnerIds`, `inferredPartnerIds`, `forceRouterOnly`, `guidanceLines`) through the builder/result schema. Only render a prompt string at the final display/download boundary, and escape or quote the original user brief instead of reparsing it.

### P2 - Builder custom integrations/templates are exposed but ignored by generation

The UI accepts custom add-ons/templates through `src/components/builder/CustomAddonDialog.tsx:25-72` and `src/components/builder/CustomTemplateDialog.tsx:24-64`, and the store keeps them at `src/components/builder/store.ts:46-49` and `src/components/builder/store.ts:250-284`. The docs page also advertises custom template/integration import and export at `src/routes/builder.docs.tsx:102-111`.

The generation path then drops them. `src/components/builder/store.ts:404-410` omits `packageManager`, `tailwind`, `customIntegrations`, and `customTemplate` from `getDefinition()`. `src/builder/api/compile.ts:210-217` explicitly passes empty custom add-on/template inputs, and `src/builder/api/compile.ts:604-605` does the same for attribution compile. `src/components/builder/client-generation.ts:41-59` also sends no custom integration/template data.

Result: a user can add and select a custom integration/template, see it in the UI, and then download/deploy/generated output that does not include it.

Suggested fix: either hide/disable the custom UI until supported or make custom integrations/templates first-class fields in the shared builder definition schema and pass them through validate, compile, download, deploy, attribution, feature-artifacts, and MCP.

### P2 - Outbound fetch behavior is inconsistent

Many server-side external calls lack a consistent timeout/status/body policy. Examples include OAuth provider calls, GitHub repo deploy calls, Tranco, stats, intent, docs, and remote builder fetches.

The same pattern exists in browser code. `src/hooks/useQueryGGPPPDiscount.ts:13-25` fetches `https://ppp.uidotdev.workers.dev/`, does not check status/content-type, trusts arbitrary JSON as `{ code, country, discount, flag }`, has no abort/unmount guard, and `src/components/QueryGGBanner.tsx:20-29` renders the returned country/flag/discount directly into the marketing banner. `src/components/npm-stats/PackageSearch.tsx:55-67` also fetches npm registry search results directly, casts the JSON body shape, and treats arbitrary typed input as a package name through the create item at `src/components/npm-stats/PackageSearch.tsx:74-86`.

Suggested fix: introduce one outbound fetch helper with:

- timeout
- retry policy where appropriate
- response-size cap for user-triggered remote loads
- status and content-type handling
- sanitized logging context
- runtime parsing for client-rendered third-party JSON

### P2 - Session base64 fallback is fragile

`src/auth/session.server.ts` has a hand-written byte/base64 fallback. In modern worker/browser runtimes this probably does not execute, but the fallback is concretely wrong for unpadded base64url strings: `src/auth/session.server.ts:67-80` strips `=` padding, maps missing encoded characters to `0`, and then checks `enc3 !== 64`/`enc4 !== 64`, so runtimes without `atob` can decode extra null bytes.

Suggested fix: replace with a small, tested base64url byte helper and add round-trip tests.

### P2 - Auth helper records activity as a hidden side effect

`src/utils/auth.server-helpers.ts:25-39` makes `getAuthenticatedUser()` record daily activity in a fire-and-forget write. That helper is used by admin/user/showcase/doc-feedback/activity paths, including `src/utils/users.server.ts:29`, `src/utils/showcase.functions.ts:61`, and `src/utils/docFeedback.functions.ts:58`.

Auth reads now carry analytics write behavior, and repeated capability/admin checks can create repeated DB insert attempts. Errors are swallowed, so activity tracking can silently fail while auth succeeds. The upsert is idempotent per day, but the coupling makes request behavior harder to reason about and test.

Suggested fix: move activity recording to one explicit request/session activity hook or middleware, keep auth helpers side-effect-free, and expose an intentional `recordAuthenticatedActivity()` call for routes that want it.

### P2/P3 - Legacy plaintext OAuth tokens are still silently accepted

`src/utils/crypto.server.ts:116-119` returns a stored token as plaintext when it does not look encrypted. `src/auth/repositories.server.ts:161-180` uses that helper when reading OAuth account tokens.

This is pragmatic for migration, but it also means plaintext token rows can persist indefinitely with no telemetry, re-encryption, or cutoff. If the goal is encrypted tokens at rest, reads should either migrate plaintext rows forward or surface a measured migration debt.

Suggested fix: add a one-time/backfill migration, count plaintext reads, re-encrypt on successful read where possible, and eventually fail closed for non-encrypted stored OAuth tokens.

### P3 - Session revocation increments are read-modify-write

`src/auth/repositories.server.ts:103-115` reads the user, then writes `sessionVersion: user.sessionVersion + 1`. `src/routes/auth/signout.tsx:13-30` uses that path during signout, and `src/utils/users.server.ts:562-606` repeats the same read/compute/write flow for admin/self session revocation.

Concurrent revokes can lose increments, and audit logs can report a stale `newVersion`. Use an atomic SQL increment/update returning the new version, then share that helper between signout and `revokeUserSessions`.

### P2 - Local docs path containment check has a prefix edge

`src/utils/documents.server.ts:261-270` checks `localFilePath.startsWith(baseDir)`. If a base path lacks a trailing separator, a sibling path with the same prefix can pass in general. Earlier filepath validation reduces practical risk, but this should still use `path.relative`.

Suggested fix: `const rel = path.relative(baseDir, localFilePath)` and reject `rel.startsWith('..') || path.isAbsolute(rel)`.

### P2 - Frontmatter replacement builds regexes from content

`src/utils/documents.server.ts:290-296` does `new RegExp(key, 'g')` from frontmatter replacement keys. Invalid or pathological patterns can throw or behave unexpectedly.

Suggested fix: treat replacement keys as literals unless regex replacement is explicitly needed. If regex is needed, add schema validation and bounded complexity.

### P2 - Malformed frontmatter can break docs pages and manifests

`src/utils/documents.server.ts:580-603` parses YAML frontmatter with `parseYaml(frontMatterSource)` and does not catch parser errors. The ref-resolution path catches extraction failures at `src/utils/documents.server.ts:496-506`, but normal docs serving does not: `src/utils/docs.functions.ts:276-300` calls `extractFrontMatter(file)` in the page loader, and manifest generation calls it for every markdown file at `src/utils/docs.functions.ts:181-189`.

That means one malformed remote markdown frontmatter block can break the affected page, and during manifest generation it can abort redirects for the whole docs root instead of skipping only the bad file.

Suggested fix: make `parseFrontMatter` return `{ content, data: {} }` plus a logged diagnostic on YAML parse errors, or return a typed parse result and let manifest generation skip bad files while page serving falls back to body-only rendering.

### P2 - GitHub recursive tree truncation is treated as complete data

`src/utils/documents.server.ts:726-729` models GitHub's recursive tree response with an optional `truncated` flag. `src/utils/documents.server.ts:938-963` validates and caches that response but returns `data?.tree` without checking `truncated`. `src/utils/documents.server.ts:1180-1191` then builds docs file trees from that data, and `src/utils/github-example.server.ts:38-80` uses the same tree to decide which example files to fetch.

If GitHub truncates a large repository tree, docs manifests, example explorers, and example deploys can silently omit files. This is worse than an explicit failure because it can cache an incomplete tree as valid content.

Suggested fix: reject or separately mark truncated recursive-tree responses, avoid caching them as successful content, and fall back to paged/non-recursive traversal for large repositories when a complete tree is required.

### P2 - Markdown raw HTML/iframe policy needs a documented trust boundary

Markdown parsing and rendering use raw HTML:

- `src/utils/markdown/processor.ts:21-23`
- `src/components/markdown/Markdown.tsx:33-40`
- `src/components/markdown/Markdown.tsx:86-88`
- `src/components/SearchModal.tsx:195-212` manually strips highlight placeholders and then renders search-highlight markup through `dangerouslySetInnerHTML`
- `src/utils/markdown/processor.ts:206-235` collects heading text from parsed inline nodes, and `src/components/Breadcrumbs.tsx:63-77`, `src/components/Toc.tsx:60-79`, and `src/components/TocMobile.tsx:41-47` render that heading text as HTML

This may be acceptable for trusted TanStack docs/blog content. It should be centralized as a deliberate policy, with a separate safe renderer for untrusted or partner/user content.

Suggested fix:

- Document which markdown sources are trusted.
- Restrict iframe `src` to known hosts where possible.
- Use a no-HTML renderer or sanitizer for untrusted content.
- Prefer token/render-function highlight rendering for search results instead of HTML string replacement.

### P3 - Markdown link routing only recognizes a few external protocols

`src/components/markdown/MarkdownLink.tsx:4-12` classifies links as relative unless they start with `/`, `http://`, `https://`, `//`, `#`, or `mailto:`. That means valid non-HTTP links such as `tel:`, `sms:`, `ftp:`, `webcal:`, or package/editor schemes are treated as relative TanStack Router links and rewritten at `src/components/markdown/MarkdownLink.tsx:76-97`.

The docs chrome has the same problem in a narrower form. `src/components/LibraryLayout.tsx:885-889` excludes only `http` links from prev/next navigation, `src/components/LibraryLayout.tsx:1012-1021` renders only `http` children as anchors, and other protocols fall through to TanStack Router links at `src/components/LibraryLayout.tsx:1087-1101` or prev/next cards at `src/components/LibraryLayout.tsx:676-686`. Navbar has its own slightly different classifier at `src/components/Navbar.tsx:368-370`.

Suggested fix: replace the hand-written prefix checks with a parsed link classifier: route only same-origin path links through `<Link>`, leave any recognized absolute or custom scheme as a normal anchor, and explicitly reject or sanitize unsafe schemes for untrusted markdown.

### P3 - Community resource frontmatter is rendered without a resource schema

`src/routes/_library/$libraryId/$version.docs.community-resources.tsx:15-34` catches any docs-load/frontmatter failure and returns `doc: null as null | any`. The render path then reads `data.doc?.frontmatter` and passes `frontmatter.articles`, `media`, `utilities`, and `others` directly into `CommunitySection` at `src/routes/_library/$libraryId/$version.docs.community-resources.tsx:65-114`.

`CommunitySection` assumes each item has `{ title, description, url }` and renders `href={res.url}` at `src/routes/_library/$libraryId/$version.docs.community-resources.tsx:121-147`. Since this content comes from remote docs frontmatter, malformed arrays can break rendering and unsafe/non-HTTP schemes can become clickable resource cards.

Suggested fix: add a `communityResourcesFrontmatterSchema` with bounded arrays and strings, URL protocol validation, and a skipped-resource diagnostic. Reuse the same external-link classifier recommended for markdown links.

### P3 - Library Scarf tracking ids are duplicated

Library routes mount a Scarf tracking image when `library.scarfId` is present at `src/routes/_library/$libraryId/route.tsx:99-103`. The image URL uses only the id plus route location key at `src/components/Scarf.tsx:4-17`.

`src/libraries/libraries.ts:515`, `src/libraries/libraries.ts:548`, and `src/libraries/libraries.ts:610` assign the same Scarf pixel id to Store, Pacer, and DB. If these are supposed to measure package-specific traffic, those three library pages are being attributed to one pixel. The current image also has `alt="scarf analytics"` and a full fixed viewport box, so an invisible tracking pixel can still show up as an image in accessibility tooling.

Suggested fix: validate library metadata for unique `scarfId` values, make shared/org-level ids explicit if intentional, and render the tracking pixel as `alt=""`, `aria-hidden="true"`, `width={1}`, `height={1}` with no full-screen fixed box.

### P3 - Search/AI source links classify internal URLs by substring

`src/components/SearchModal.tsx:607-624` treats any href containing `//tanstack.com` as internal before parsing it. A URL like `https://example.com/redirect?next=//tanstack.com/query/latest` can be converted into a TanStack Router link to `/query/latest` instead of remaining an external link. Kapa source links and Algolia hit URLs flow through this helper at `src/components/SearchModal.tsx:641-671`, `src/components/SearchModal.tsx:1683-1691`, and `src/components/SearchModal.tsx:3125-3142`.

Suggested fix: replace substring matching with a shared `getInternalTanStackRouteTarget` helper that parses `new URL(href, origin)`, requires `url.origin === location.origin` or an explicit `https://tanstack.com` allowlist, rejects static/API paths, and preserves hash/search. Reuse it anywhere external source URLs become router links.

### P2 - Search modal body pointer lock can restore the wrong global state

`src/components/SearchModal.tsx:3370-3445` stores and rewrites `document.body.style.pointerEvents` across three effects, a timeout, and animation frames. On open it forces the body to `pointer-events: none` at `src/components/SearchModal.tsx:3420-3422`; on close it restores from a mount-time ref at `src/components/SearchModal.tsx:3391-3396` and `src/components/SearchModal.tsx:3425-3429`; and unmount restores the same ref at `src/components/SearchModal.tsx:3442-3444`.

This is fragile when another overlay also owns body pointer events, when Radix changes the same style, or when the component unmounts during the close transition. The site can restore an old empty value over a newer owner, or leave the body non-interactive after an interrupted close.

Suggested fix: delete this if Radix can own modal outside-pointer behavior, or centralize body locks in a reference-counted `useBodyStyleLock` helper that stores an owner token and restores only if it still owns the property.

### P3 - Legacy docs redirects use prefix matches without segment boundaries

`src/utils/handleRedirects.ts:17-26` parses the request URL, then redirects when `url.pathname.startsWith(`${urlFromPathStart}/${item.from}`)`. This means a legacy item such as `overview` also matches paths like `/query/v3/overview-extra`. The route hooks at `src/routes/-library-landing-route.tsx:25-35`, `src/routes/_library/$libraryId/$version.index.tsx:6-19`, and `src/routes/_library/$libraryId/$version.tsx:14-23` run these redirect tables before normal docs loading.

Router-specific redirects also use broad `href.includes(...)` checks at `src/libraries/libraries.ts:233-267`, including the full href string rather than only the pathname. Query strings containing `/examples/` can alter whether a framework-docs redirect runs. The Start project repeats the full-href regex/replace shape for `/api-routes` at `src/libraries/start.tsx:153-164`. The root route has the same full-href shape for old framework docs redirects at `src/routes/__root.tsx:144-153`, and the blog loader has a hard-coded substring redirect at `src/utils/blog.functions.ts:58-62`.

Suggested fix: convert redirect tables into normalized path matchers that compare full path segments, preserve intended search/hash behavior, and only inspect `url.pathname` for route classification.

### P2/P3 - Remote docs config lacks size and shape caps

`src/utils/config.ts:29-66` validates remote `docs/config.json`, but every string and array is unbounded. A remote config can include very large section/child arrays, long labels/paths/badges/dates, and large framework nesting before it feeds docs sidebars, generated `index.md`, and `llms.txt`.

Callers include the docs-config query (`src/queries/docsConfig.ts:17-24`) and markdown/text endpoints (`src/routes/_library/$libraryId/$version.docs.index[.]md.ts:24-38`, `src/routes/_library/$libraryId/$version.llms[.]txt.ts:22-36`). `src/utils/llms.ts:311-335` then formats config labels, URLs, badges, and dates directly into Markdown links without escaping Markdown control characters, so malformed or adversarial docs config can corrupt generated agent-facing indexes.

`parseDocsConfig` logs validation issues and thrown errors at `src/utils/config.ts:74-83` and `src/utils/config.ts:117-136`, which can also make malformed remote content noisy in production logs.

Suggested fix: add max lengths for labels, paths, badges, and dates; cap section/framework/child counts; normalize `to` paths; escape Markdown labels/URLs/metadata in LLM/index outputs; and return a stable empty/fallback config plus a sanitized log summary when remote config is invalid.

### P2 - Docs manifest generation fans out over every markdown file

`src/utils/docs.functions.ts:151-213` builds a docs manifest by flattening the docs tree, filtering every markdown file, fetching each file at `src/utils/docs.functions.ts:181`, and parsing frontmatter redirects. The result is cached by `getCachedDocsArtifact` at `src/utils/docs.functions.ts:224-232`, but cold cache, invalidation, and forced stale paths still pay the full repo walk.

`src/utils/docs.functions.ts:90-95` also accepts a `docsPaths` array for redirect resolution with no array-length cap. The tree fetch itself can already be incomplete if GitHub truncates the recursive tree, covered above.

Suggested fix: cap docs manifest file counts, add a build deadline/concurrency limit, cache redirect metadata separately during docs content fetches, and cap `docsPaths` in `fetchDocsRedirect` input.

### P2 - Markdown framework tabs cast raw mode strings

`src/utils/markdown/filterFrameworkContent.ts:185-195` parses `InstallMode` from markdown attributes and casts the value at `src/utils/markdown/filterFrameworkContent.ts:191` before passing it into install-command generation. The framework/package-manager extraction tests in `tests/filter-framework-content.test.ts:1-69` do not cover filtering output or invalid `mode` values.

The dynamic attribute regex at `src/utils/markdown/filterFrameworkContent.ts:208-211` is currently fed internal attribute names, so that part looks acceptable. The boundary issue is the raw markdown value becoming an install-mode enum through a cast.

Suggested fix: validate markdown tab `mode` against the install-mode picklist before use, and add tests for invalid/unknown modes.

### P2 - Showcase voting can throw under concurrent first votes

`src/utils/showcase.functions.ts:704-735` reads an existing vote, then inserts if none exists. The table has a uniqueness rule for `(showcaseId, userId)`, so concurrent first votes can hit a unique-constraint error.

Suggested fix: use a transaction/upsert path and recompute/update score in the same transaction, or store score as a derived query/cache instead of a separately maintained counter.

### P3 - Showcase gallery optimistic vote keys omit one active filter

`src/components/ShowcaseGallery.tsx:30-42` fetches approved showcases with `hasSourceCode: search.hasSourceCode`, but the optimistic vote snapshot, update, and rollback query keys omit that filter at `src/components/ShowcaseGallery.tsx:73-82`, `src/components/ShowcaseGallery.tsx:117-126`, and `src/components/ShowcaseGallery.tsx:155-169`.

When the open-source filter is active, the optimistic score update can target a different cache entry than the visible gallery. The eventual invalidation still reconciles, but the UI loses the immediate feedback and rollback symmetry that the rest of the mutation code is trying to provide.

Suggested fix: build showcase gallery query options from one local `galleryQueryInput` object that includes pagination and every active filter, then reuse that object for the read query, optimistic snapshots, optimistic updates, and rollbacks.

### P3 - NPM summary duplicates and weakens the shared recent-downloads query

`src/queries/stats.ts:38-55` already exports a shared `recentDownloadsQuery` that keys by `id`, `npmPackageNames`, `repo`, and `frameworks`, then sends that same normalized library object to `fetchRecentDownloadStats`.

`src/components/npm-stats/NPMSummary.tsx:30-45` defines a second local `recentDownloadsQuery`. Its query key is only `['npm-recent-downloads', library.id]`, and its request omits `library.npmPackageNames` even though package names are part of the shared query contract. If package metadata changes under the same library id, or a library has explicit package names that differ from repo/framework inference, the summary can reuse stale data or ask the server for a different package set than the shared stats query.

Suggested fix: delete the local query wrapper and import the shared `recentDownloadsQuery` from `src/queries/stats.ts`.

### P2 - Feedback leaderboard loads all approved feedback into JS

`src/utils/docFeedback.functions.ts:448-520` fetches all approved feedback, aggregates in memory, sorts in JS, then paginates.

Suggested fix: move aggregation and sorting into SQL, or maintain a materialized/user aggregate table updated on moderation changes.

### P2 - Docs feedback input accepts unbounded content and metadata

`src/utils/docFeedback.functions.ts:26-117` accepts feedback `content`, `pagePath`, `libraryId`, `libraryVersion`, `blockSelector`, `blockContentHash`, and `blockMarkdown` with minimum-length checks but no max lengths. `src/utils/docFeedback.functions.ts:122-170` allows unbounded update content. `src/utils/docFeedback.functions.ts:531-587` takes uncapped page identifiers for page feedback lookup, and `src/utils/docFeedback.functions.ts:622-640` accepts an uncapped `feedbackIds` array.

The feature is authenticated and has a submission-count rate limit at `src/utils/docFeedback.server.ts:135-150`, but one request can still carry very large text/metadata.

Suggested fix:

- Add shared schemas for doc feedback content, page path, library id/version, block selector, block hash, and block text.
- Cap markdown/block text separately from user-authored note/improvement text.
- Add bounded UUID array helpers for batch moderation functions.
- Consider server-side normalization of `pagePath` to the router/docs path shape.

### P2 - Moderation notifications are fire-and-forget async calls

`src/utils/docFeedback.functions.ts:101-110` and `src/utils/showcase.server.ts:278-287` call `notifyModerators` without `await` or `.catch()`, but `notifyModerators` is async at `src/utils/email.server.ts:46-65`.

If Discord notification fails, the submission succeeds but the failure can become an unhandled rejection depending on runtime behavior.

Suggested fix: either `await notifyModerators` inside a best-effort `try/catch`, or enqueue moderation notifications in a durable/background queue. Log a sanitized failure with enough context to retry manually.

### P2 - Showcase submission schemas have partial caps and synchronous rank lookup

`src/utils/showcase.functions.ts:32-58` and `src/utils/showcase.functions.ts:91-118` cap `name` and `tagline`, but leave `description`, URL fields, `libraries`, and `useCases` arrays without explicit maximums. Admin moderation/update schemas repeat the same loose URL/description shape at `src/utils/showcase.functions.ts:501-533`.

Public gallery search also accepts uncapped `page`, `pageSize`, and query text at `src/routes/showcase/index.tsx:8-15`, then applies those values in `searchShowcasesCore` at `src/utils/showcase.server.ts:515-583`.

The image URL contract is also looser on the server than the UI implies. `src/components/ShowcaseSubmitForm.tsx:280-297` only exposes UploadThing-backed uploads through `ImageUpload`, and `src/server/uploadthing.ts:35-56` caps showcase image upload size/count. The server write paths still accept any HTTP(S) `logoUrl`/`screenshotUrl` at `src/utils/showcase.server.ts:157-174`, so external image URLs can be stored and rendered publicly in `src/components/ShowcaseCard.tsx:47-59`, `src/components/ShowcaseDetail.tsx:234-251`, and moderation/account surfaces.

Submission and URL-changing edits synchronously call Tranco:

- `src/utils/showcase.server.ts:234-235`
- `src/utils/showcase.server.ts:351-355`
- `src/utils/tranco.server.ts:63-95`

`getTrancoRank` does not use a timeout/cache helper and logs upstream errors directly.

Related showcase caching has a separate correctness issue. `src/queries/showcases.ts:92-107` uses `params.libraries` and `params.limit` in the query function but keys the query only by `params.showcaseId` at `src/queries/showcases.ts:97-98`. Different related-showcase requests for the same showcase can reuse the wrong cached result.

Suggested fix:

- Add a shared showcase input schema with URL length caps, description cap, bounded library/use-case arrays, and normalized URL handling.
- Decide whether showcase images must be UploadThing-owned URLs; if yes, validate by host/key prefix server-side.
- Cap gallery and moderation page sizes independently on the server-function boundary.
- Move Tranco ranking to a cached/background enrichment job, or call it through the shared outbound fetch helper with a tight timeout.
- Include every query-function input in related-showcase query keys, or normalize the related-showcase request into a shared query-options schema.

### P3 - Showcase moderation rows reuse the same note input id

Expanded pending rows in `src/components/ShowcaseModerationList.tsx:527-548` render a `<label htmlFor="note">` and `<textarea id="note">` for each row. If multiple pending rows are expanded, the DOM contains duplicate ids and labels can target the first textarea instead of the row-local note.

Suggested fix: derive the id from the showcase id, such as `showcase-note-${showcase.id}`, or wrap the textarea in the label if the design allows it.

### P3 - Feedback moderation note labels point at no textarea

`src/components/FeedbackModerationList.tsx:335-337` derives a row-local `htmlFor` value, but the textarea rendered at `src/components/FeedbackModerationList.tsx:341-352` does not receive the matching `id`. The accessible label is therefore disconnected even though the code looks like it already solved the duplicate-id problem.

Suggested fix: pass `id={`moderation-note-${feedback.id}`}` to the textarea, and make this the same row-local id helper used by showcase moderation.

### P3 - Moderation date filters reuse global input ids

`src/components/FeedbackModerationTopBar.tsx:170-200` and `src/components/NotesModerationTopBar.tsx:129-154` both hard-code date input ids as `from` and `to`. Those components are route-specific today, but they sit inside shared responsive filter UI and can produce duplicate ids if a hidden mobile filter copy remains mounted during viewport changes or if multiple moderation/filter bars are rendered together later.

Suggested fix: generate ids with `React.useId()` or add a `DateRangeFilter` primitive that owns unique ids, labels, parsing, and route-search updates.

### P3 - Account email label points at no input

`src/routes/account/index.tsx:103-115` renders `<label htmlFor="email">` for the disabled email field, but the input has no `id`. That disconnects the accessible name from the control and is another small example of form labels being hand-wired per page.

Suggested fix: add `id="email"` to the input, or move these static read-only fields onto the same form-field helper used by editable account/admin fields.

### P2/P3 - Current-user account query keys are not session-scoped

Several account queries fetch data for the current authenticated user but use cache keys that do not include a user id, session version, or auth fingerprint:

- `src/queries/docFeedback.ts:25-36` uses `['docFeedback', 'user', params]`, consumed by `src/routes/account/feedback.tsx:24-29` and `src/routes/account/notes.tsx:24-29`.
- `src/queries/showcases.ts:28-34` uses `['showcases', 'mine', params]`, consumed by `src/routes/account/submissions.tsx:21-48`.
- `src/routes/account/index.tsx:35-39` uses `['my-streak']` for authenticated activity data.
- `src/routes/account/integrations.tsx:45-48` uses `['api-keys']`, and `src/routes/account/integrations.tsx:103-106` uses `['connected-apps']`.

The server functions correctly scope results to the authenticated user, but the client cache does not. Sign-out paths call `authClient.signOut()` and navigate at `src/routes/account/index.tsx:72-83` and `src/components/NavbarAuthControls.tsx:54-65`; they do not clear the React Query cache. A same-browser sign-out/sign-in or account switch can temporarily show stale account data until those queries refetch.

Suggested fix: include a stable auth fingerprint (`userId` plus `sessionVersion` if available) in current-user query keys, and clear or remove user-private query namespaces on sign-out/login transitions. Treat anonymous/current-user cache invalidation as an auth lifecycle concern, not individual page cleanup.

### P3 - Admin bulk-action labels share a missing target

`src/routes/admin/users.tsx:824-858` renders two bulk-action labels with `htmlFor="bulk-update-capabilities"`. The role `<select>` at `src/routes/admin/users.tsx:830-843` has no matching `id`, and the capabilities actions are buttons, not one labeled control. Screen readers get disconnected labels, and the duplicated id target would still be ambiguous if one were added blindly.

The roles admin create form repeats the missing-target pattern: `src/routes/admin/roles.index.tsx:483-519` renders labels for `role-name`, `role-description`, and `role-capabilities`, but the `FormInput` controls at `src/routes/admin/roles.index.tsx:490-511` do not receive matching ids and the capabilities section labels a `<div>`.

Suggested fix: give the role select a unique id such as `bulk-assign-role`, remove `htmlFor` from button-group labels or use grouped fieldsets/legends, and put this on the shared admin form-field pattern.

### P3 - Admin detail pages mask query errors as missing records

`src/routes/admin/showcases_.$id.tsx:176-211`, `src/routes/admin/users.$userId.tsx:44-79`, and `src/routes/admin/feedback_.$id.tsx:54-89` only special-case loading. If the query errors, `query.data` is `undefined`, so the UI falls into "Showcase not found", "User not found", or "Feedback not found" instead of showing the server/auth/network error.

The detail pages also hide secondary query failures: `src/routes/admin/users.$userId.tsx:81-83` renders empty roles/effective capabilities when those queries fail, and the showcase/feedback moderation mutations only show some edit errors but not approve/deny failures.

Suggested fix: add a shared `AdminQueryState` helper that distinguishes loading, error, not found, and success. For secondary panels, show an inline "failed to load" state instead of silently replacing data with empty arrays.

### P3 - Public showcase detail masks query errors as missing projects

`src/components/ShowcaseDetail.tsx:38` only reads `data` and `isLoading` from the showcase query. If the request fails, `data` is undefined and `src/components/ShowcaseDetail.tsx:192-214` renders "Showcase not found" instead of a server/auth/network error. Related showcases and vote queries at `src/components/ShowcaseDetail.tsx:40-70` are also treated as optional empty panels when they fail.

Suggested fix: use the same loading/error/not-found/success state helper recommended for admin detail pages, with a public-facing error state and retry path.

### P3 - Admin audit links cannot target a specific record

`src/utils/audit.functions.ts:116-146` supports `targetId`, and the database indexes it at `src/db/schema.ts:668-683`, but the audit route search schema omits `targetId` at `src/routes/admin/audit.tsx:93-103`. The audit query key and server call also only include `actorId`, `action`, and `targetType` at `src/routes/admin/audit.tsx:160-183`.

Detail pages therefore link to broad audit views instead of the specific record they label: `src/routes/admin/showcases_.$id.tsx:913-919`, `src/routes/admin/users.$userId.tsx:334-344`, and `src/routes/admin/feedback_.$id.tsx:326-332` pass only `targetType` or no target filter at all.

Suggested fix: add `targetId` to the audit route search schema, top-bar filters, query key, and `listAuditLogs` call, then pass the concrete showcase/user/feedback id from detail pages.

### P3 - Admin route access and admin server-function access are out of sync

The admin layout says each sub-route checks specific capabilities at `src/routes/admin/route.tsx:33-40`, but several admin-only pages have no child `beforeLoad` guard: `src/routes/admin/github-stats.tsx:51-53`, `src/routes/admin/npm-stats.tsx:55-57`, `src/routes/admin/intent.tsx:32-34`, and `src/routes/admin/docs.tsx:4-6`.

The server functions behind those pages do require `admin`, for example `src/utils/stats-admin.server.ts:19`, `src/utils/intent-admin.server.ts:38`, and `src/utils/docs-admin.server.ts:11-13`. A moderator-level user can still see the nav items at `src/routes/admin/route.tsx:121-140`, open the routes, and fire rejected queries/mutations before the server denies them.

Suggested fix: give every admin-only child route its own `beforeLoad` guard and mark the matching nav items with `requiredCapability: 'admin'`. A shared admin route/nav config would keep nav visibility, route guards, and server-function capability checks aligned.

### P3 - Capability server-function validation lies to TypeScript

`src/utils/auth.functions.ts:28-37` accepts `{ capability: string }`, then casts it to `Capability` in the validator. The guard in `src/auth/guards.server.ts:45-65` will not grant access for an unknown capability, but the public server-function boundary still treats arbitrary input as a valid app capability.

That makes error semantics depend on authorization instead of validation, and it gives future callers a false sense that input has been narrowed. The real source of truth already exists in `src/db/types.ts:5-13`.

Suggested fix: validate against `CAPABILITIES` or a Valibot picklist at the server-function boundary, then make `requireCapabilityUser` accept `Capability` instead of `string`.

### P3 - Admin detail timestamps request an unsupported date format

The local date helper implements `PPp` at `src/utils/dates.ts:93-102`, but not `PPpp`. Unknown formats fall through to `console.warn` and `toISOString()` at `src/utils/dates.ts:104-107`.

Several admin detail pages call the unsupported `PPpp` token: `src/routes/admin/users.$userId.tsx:167-176`, `src/routes/admin/feedback_.$id.tsx:215` and `src/routes/admin/feedback_.$id.tsx:303`, plus `src/routes/admin/showcases_.$id.tsx:560` and `src/routes/admin/showcases_.$id.tsx:890`. Those UI fields display ISO strings instead of the intended friendly date/time and can log warnings during normal admin use.

Suggested fix: either support `PPpp` in `format()` as the expected date-plus-time shape, or update call sites to use the existing `PPp` token. Add a small unit test for every supported token used in source.

### P3 - Public filter controls repeat disconnected labels

The custom filter dropdowns repeat the same label wiring issue outside admin. `src/routes/partners.index.tsx:185-254` renders labels for `partner-status` and `library-filter`, but the controls are button groups/divs with no matching ids. `src/routes/maintainers.tsx:197-272` labels `groupBy`, `sortBy`, and `libraryFilter`, but the `<select>` elements do not receive matching ids and the library filter labels a button grid.

The blog author filter does the same thing in a smaller form: `src/routes/blog.index.tsx:112-129` points `htmlFor="blog-author-filter"` at a wrapper `<div>`, while the real dropdown trigger button lives inside `src/components/BlogAuthorFilter.tsx:36-76`.

Suggested fix: use real `id` values for select controls, and use `fieldset`/`legend` or `aria-labelledby` for button groups. This should be covered by the same repeated-form-control id helper/lint as moderation/admin forms.

### P3 - Shared sortable table headers are pointer-only

`src/components/TableComponents.tsx:131-151` renders sortable headers as `<th onClick={onSort}>` with a cursor and hover state. That gives mouse users sorting, but the header is not focusable, has no button semantics, no `aria-sort`, and no keyboard activation.

The primitive is used in admin users and login history tables at `src/routes/admin/users.tsx:887-906` and `src/routes/admin/logins.tsx:318-332`, so any new sortable admin table inherits the same accessibility gap.

The Intent admin package rows repeat the same pointer-only interaction shape at `src/routes/admin/intent.tsx:645-648`: the row expands on click and shows a pointer cursor, but it is not focusable and has no keyboard activation. Showcase moderation rows do the same at `src/components/ShowcaseModerationList.tsx:211-214`, feedback moderation rows at `src/components/FeedbackModerationList.tsx:142-148`, and notes moderation rows at `src/components/NotesModerationList.tsx:124-130`, with row expansion behind pointer-only table-row clicks and separate action buttons nested inside row cells.

Suggested fix: render a `<button type="button">` inside the `<th>`, put `aria-sort` on the header cell, and centralize sort-direction labels in the table primitive instead of repeating visual-only chevrons. For expandable rows, put a real disclosure button in the first cell or add the proper keyboard/ARIA disclosure semantics.

### P3 - Shared pagination controls repeat a broken label/id contract

`src/components/PaginationControls.tsx:111-124` renders `htmlFor="pageSize"` but the `<select>` has no `id`, so the label does not name the control. If multiple pagination controls ever render on one page, a single hardcoded id would also be the wrong fix.

The same primitive is used across account feedback/notes, admin users/audit/logins, moderation lists, the feedback leaderboard, and showcase gallery. Its pagination buttons at `src/components/PaginationControls.tsx:135-182` also omit `type="button"`, which is harmless in current table usage but fragile for any future form-owned filter surface.

Suggested fix: derive a stable local id with `React.useId()` or accept an `idPrefix`, wire `htmlFor`/`id`, and default every non-submit pagination button to `type="button"`.

### P3 - Twoslash CSS has invalid declarations

`src/styles/app.css:825-828` sets `visibility: transparent` for `.error-behind`, but `visibility` only accepts values such as `visible`, `hidden`, or `collapse`. `src/styles/app.css:924-928` also sets `.tag-container .twoslash-annotation { background-color: #fcf3d9 bb; }`, which is not a valid color.

Both declarations are ignored by the browser, so error overlays and annotation backgrounds fall through to surrounding code block styling in a way that can differ by theme.

Suggested fix: replace `visibility: transparent` with the intended `visibility: hidden` or opacity-based styling, use a valid alpha color such as `#fcf3d9bb` or `rgb(252 243 217 / 0.73)`, then verify Twoslash error and annotation examples in light and dark themes.

### P3 - App CSS carries unused global utility classes

`src/styles/app.css:547-679` defines a mini design system of global classes such as `.btn-primary`, `.btn-secondary`, `.input-base`, `.card`, `.card-elevated`, `.dropdown-menu`, `.badge-blue`, `.text-secondary`, and `.text-link`. A source scan found no app call sites for those class names outside the stylesheet.

The live app uses React primitives and Tailwind utilities instead, so these global classes add CSS surface area, create another place for visual tokens to drift, and make it harder to know which styling API is intended.

Suggested fix: delete the unused classes if they are legacy, or move the still-wanted contracts into the existing `Button`, `Card`, badge, input, and dropdown primitives with component-level examples.

### P2 - Intent failed queue retries forever without backoff

`src/utils/intent-db.server.ts:76-97` intentionally includes both `pending` and `failed` versions in `getPendingVersions`. `src/utils/intent-db.server.ts:335-343` marks failures as `failed` with no retry count, next-at timestamp, or terminal state. The scheduled processor then drains that queue in a 12-minute loop at `src/server/scheduled.server.ts:342-415`.

One permanently bad tarball can be retried every process cycle and repeatedly consume budget.

Suggested fix:

- Add `retryCount`, `nextAttemptAt`, and a terminal `dead` or `abandoned` status.
- Exponential backoff failed versions.
- Keep explicit admin retry as a separate reset path.

### P2 - Intent skill replacement is not transactional

`src/utils/intent-db.server.ts:359-392` inserts content-addressed skill bodies, deletes every `intentSkills` row for a version, then bulk-inserts the replacement metadata. `src/utils/intent-admin.server.ts:220-233`, `src/utils/intent-admin.server.ts:249-265`, and the inline public seed path at `src/utils/intent.functions.ts:362-370` call that helper and then mark the version synced or failed.

If the metadata insert fails after the delete, the version can be marked failed with its previous skill rows already gone. A later retry can rebuild them, but until then public package detail/history reads lose data for that version.

Suggested fix: wrap content insertion, metadata delete, metadata insert, and status update in one transaction-level helper such as `replaceSkillsAndMarkVersion({ versionId, skills })`. For retries, keep the previous synced rows until the replacement commit succeeds.

### P2 - CLI auth tickets are memory-only and public-create

`src/routes/api/auth/cli/create-ticket.ts:3-10` exposes a public POST that creates a ticket. The store is a `globalThis` map with a cleanup interval at `src/auth/cli-tickets.server.ts:20-60`, and status polling consumes authorized tickets at `src/routes/api/auth/cli/status.$ticketId.ts:12-37`.

The secret ticket-id model is reasonable, but the storage is not durable across isolates and there is no per-IP creation limit or map cap. In scaled/serverless environments, the browser auth request and CLI polling request can also land on different isolates.

Suggested fix:

- Move tickets to a durable short-lived store: DB, KV, Durable Object, or equivalent.
- Add public create-ticket rate limits and a fallback map cap for local/dev use.
- Validate ticket-id shape on status and auth routes.
- Unref or lifecycle-manage the cleanup interval in Node dev/test environments.

### P2 - MCP transport returns raw internal errors

`src/mcp/transport.ts:109-128` passes authenticated POST bodies into the MCP SDK and returns `error.message` in the JSON-RPC 500 response when an unhandled error escapes. The endpoint is authenticated and rate-limited, but it still lacks an explicit content-length/content-type guard before `handleRequest`.

Suggested fix:

- Add a request-size cap and content-type policy before invoking the transport.
- Log internal error details, but return a stable public `Internal error` message.

### P2/P3 - Discord interactions read raw bodies without size or signature-shape guards

`src/routes/api/discord/interactions.tsx:104-132` checks for Discord signature headers, then reads `request.text()` before applying any content-length cap. `valueToUint8Array` at `src/routes/api/discord/interactions.tsx:25-39` accepts hex strings by chunking pairs and `Number.parseInt`-ing each byte, but it does not enforce expected Ed25519 signature/public-key lengths or reject non-hex characters before importing/verifying.

The signature verification is the right boundary, but the route should still fail cheap on obviously malformed requests.

Suggested fix:

- Add a small content-length cap before `request.text()`.
- Validate signature/public-key hex length and characters before `crypto.subtle.importKey`/`verify`.
- Parse the interaction body through a small runtime schema after signature verification.

### P2 - Admin validators are too loose for capability and pagination inputs

`src/utils/users.functions.ts:18-37` accepts uncapped list filters and casts `capabilityFilter`. `src/utils/users.functions.ts:60-92` accepts plain string arrays for capability updates and bulk updates, then casts to `Capability`.

The same min-only pagination pattern appears in route search. For example, `src/routes/admin/audit.tsx:87-93` accepts `pageSize` with `v.minValue(1)` but no max before passing it into `listAuditLogs` at `src/routes/admin/audit.tsx:151-164`. `src/routes/admin/showcases.index.tsx:9-15`, `src/routes/admin/feedback.index.tsx:9-17`, `src/routes/admin/notes.index.tsx:21-38`, and `src/routes/admin/logins.tsx:69-80` do the same for moderation/login-history `pageSize`. The feedback/notes date filters are raw strings, and `src/routes/admin/logins.tsx:76` accepts arbitrary `sortBy` strings before forwarding them to `listLoginHistory`.

Suggested fix:

- Use `v.picklist(VALID_CAPABILITIES)` everywhere capabilities enter the system.
- Cap `limit`, page size, filter lengths, and bulk array sizes.
- Remove the casts.

### P2 - Admin role/user queries can become all-table and unbounded bulk operations

`src/utils/users.server.ts:129-168` fetches all matching users when filtering by effective capabilities, computes capability maps in JS, filters in memory, then paginates. That is manageable at small user counts but becomes an admin-page performance cliff as user volume grows.

Role operations also accept uncapped arrays:

- `src/utils/roles.functions.ts:281-370` assigns all submitted role ids to one user.
- `src/utils/roles.functions.ts:384-458` accepts arbitrary `userIds` arrays for bulk role/capability reads.
- `src/utils/roles.functions.ts:489-603` removes/assigns role relationships for arbitrary user and role array sizes, then writes audit logs with `Promise.all`.

Suggested fix:

- Move effective-capability filtering into SQL or a materialized effective-capability table.
- Add bounded bulk schemas for `userIds` and `roleIds`.
- Chunk audit logging and DB writes where large admin operations remain intentional.
- Centralize role/capability schemas so `users.functions`, `roles.functions`, and admin route search schemas share the same picklists and caps.

### P2/P3 - Admin bulk selections survive filter and page changes

The users admin keeps selected ids in component state at `src/routes/admin/users.tsx:214`, mutates that set from row checkboxes at `src/routes/admin/users.tsx:403-423`, and then sends the whole set to bulk role/capability mutations at `src/routes/admin/users.tsx:425-462`. Filter, sort, page, and page-size changes update route search at `src/routes/admin/users.tsx:242-275` and `src/routes/admin/users.tsx:954-968`, but there is no effect that intersects or clears `selectedUserIds` when the visible query changes.

The role detail page repeats the same shape for users assigned to a role. It stores `selectedUserIds` at `src/routes/admin/roles.$roleId.tsx:30-36`, toggles all rows from the current `usersWithRole` array at `src/routes/admin/roles.$roleId.tsx:91-98`, and removes `Array.from(selectedUserIds)` from the current `roleId` at `src/routes/admin/roles.$roleId.tsx:56-64`. If the route param or query data changes while the component stays mounted, stale ids can remain selected under the new role context.

That means an admin can select users on page A, change filters, pages, or roles, then apply a bulk role/capability operation while the action bar only shows a count. Hidden or stale selected users are still included.

Suggested fix: store the selection with a query fingerprint, clear or intersect it whenever the query key changes, and make the bulk action bar show exactly which visible and hidden users will be affected. Reuse that pattern for any admin table with cross-row bulk actions.

### P2 - Admin role and user mutations are not transactional

Several admin mutations perform multi-step writes plus audit logging without a database transaction. `src/utils/roles.functions.ts:281-369` deletes old role assignments, inserts new ones, then writes audit logs. `src/utils/roles.functions.ts:489-603` bulk-removes or bulk-creates assignments and records one audit row per affected user. `src/utils/users.server.ts:426-559` updates user capabilities before writing audit records, and `src/utils/users.server.ts:562-609` increments session versions before recording the revocation audit log. Showcase admin paths repeat this shape: moderation updates the showcase and then inserts an audit row at `src/utils/showcase.functions.ts:350-400`, admin edits update the row and then audit at `src/utils/showcase.functions.ts:501-633`, and deletes remove the row before audit insertion at `src/utils/showcase.functions.ts:639-667`.

If an insert, delete, update, or audit write fails halfway through, the admin action can leave data changed with missing audit history, or audit history written for only part of the intended bulk operation.

Suggested fix: add a small transaction helper for admin mutations that receives the transaction client, performs the domain write and audit writes together, and returns typed partial-success data only for operations that are intentionally best-effort.

### P2 - Admin analytics/chart endpoints accept unbounded ranges

`src/utils/audit.functions.ts:11-106` and `src/utils/audit.functions.ts:109-230` accept raw pagination limits and date strings for login/audit log tables. `src/utils/audit.functions.ts:430-460`, `src/utils/activity.functions.ts:54-63`, and `src/utils/user-stats.functions.ts:11-15` accept arbitrary `days` values, including all-time/null and nonsensical negative or huge values.

The underlying handlers are admin-only, but the charts can still ask for broad historical ranges and build large result sets. `src/utils/activity.server.ts:206-292` also computes streak leaderboards by loading all activity for users active in the last 30 days and sorting in JS. `src/utils/activity.server.ts:300-309` then builds a raw SQL `IN` clause from user ids even though Drizzle `inArray` is used elsewhere.

Suggested fix:

- Add shared admin table/chart schemas: bounded `limit`, bounded `page`, `dateFrom/dateTo` parsing, and an explicit picklist of supported ranges.
- Reject negative/NaN `days` and cap maximum all-time chart ranges unless the route deliberately asks for all-time.
- Move streak leaderboard computation toward SQL/materialized aggregates as the activity table grows.
- Replace raw SQL `IN` string construction with `inArray(users.id, userIds)`.

### P3 - Admin ratio cards do not guard zero denominators

The admin dashboard assumes there is at least one user when it renders ad metrics. `src/routes/admin/index.tsx:992-995` computes waitlist percentage as `waitlistCount / totalUsers`, `src/routes/admin/index.tsx:1044-1046` turns that into a progress width, and `src/routes/admin/index.tsx:1069-1082` repeats the same pattern for disabled ads. On an empty or freshly seeded environment, `totalUsers` can be `0`, which renders `Infinity%` and a misleading full progress bar.

Suggested fix: add a tiny `safePercentage(numerator, denominator)` helper that returns `{ value, label, width }` or `null`, and use it for admin/dashboard ratios instead of repeating inline division.

### P2 - Admin stats maintenance endpoints can load whole caches

`src/utils/stats-admin.functions.ts:14-61` exposes admin stats server functions without pagination on list operations and accepts loose `org` strings at `src/utils/stats-admin.functions.ts:58`. The server implementations return broad result sets:

- `src/utils/stats-admin.server.ts:18-33` lists all GitHub stats cache rows.
- `src/utils/stats-admin.server.ts:166-199` lists all matching npm packages.
- `src/utils/stats-admin.server.ts:255-306` lists org cache rows and performs per-entry package queries.
- `src/utils/stats-admin.server.ts:312-356` loads all packages for a library.
- `src/utils/stats-admin.server.ts:367-383` refreshes an arbitrary org string.

`src/routes/admin/npm-stats.tsx:62-75` and `src/routes/admin/github-stats.tsx:58-61` call these on page load. This is admin-only, but it can still become a slow internal page and an accidental expensive maintenance action.

There is also correctness drift between stats paths. `src/utils/stats-admin.server.ts:205-218` refreshes a single package through a wide `/downloads/point/2010-01-01:2030-12-31/...` request, while the scheduled/full refresh path uses chunked `/range/` requests because `/point/` is limited. `src/utils/stats.functions.ts:288-297` retries npm 429s forever inside a chunk loop. `src/utils/stats.functions.ts:73-124` fetches GitHub org repo pages until `rel="next"` disappears with no page cap. `src/utils/stats.functions.ts:450-457` interpolates `org` into the npm org URL, and `src/utils/stats-db.server.ts:893-900` interpolates `org` into a regex, both fed by the loose admin org input.

Suggested fix: paginate cache/package lists, validate and encode org/package names through the same stats schemas as public code, use one chunked download implementation for all package refreshes, cap external pagination/retry loops, and put refresh operations behind explicit bounded jobs.

### P2/P3 - GitHub stats cache drops contributor counts

`src/utils/stats-db.server.ts:1168-1201` accepts a `GitHubStats` object and preserves several fields from the new, existing, or previous cache values. It hard-codes `contributorCount: 0` and `dependentCount: 0`, though, so any caller that eventually supplies real contributor data will lose it on write.

The admin GitHub stats table still treats contributor count as a real cached metric at `src/routes/admin/github-stats.tsx:126-145`, including deltas against previous stats. That means the UI can report stable zero contributors and zero deltas even when the cache input carried a non-zero count.

Suggested fix: either preserve `stats.contributorCount` through the same merge policy as fork/repository counts, or remove contributor count from the cache/admin UI until the GitHub stats fetcher intentionally supports it. Avoid keeping a required `GitHubStats` field that the write path silently overwrites.

### P2 - Docs cache admin scans and invalidates blob storage without budgets

`src/components/admin/DocsCacheTab.tsx:55-69` loads docs cache stats as soon as the admin docs tab mounts and exposes an "Invalidate All Docs" action. The server function wrappers at `src/utils/docs-admin.functions.ts:8-18` have no pagination or operation budget. `src/utils/docs-admin.server.ts:11-72` calls `listDocsCacheRepoStats`, which scans every GitHub content and docs artifact object. `src/utils/docs-admin.server.ts:75-104` can call `markGitHubContentStale({ repo: undefined })` and `markDocsArtifactsStale({ repo: undefined })`, which means every cached repo/ref/object is listed, read, and rewritten as stale.

The blob backend does all of that with unbounded loops: `src/utils/github-content-cache.server.ts:724-740` lists pages until the storage cursor ends, `src/utils/github-content-cache.server.ts:1032-1057` computes full repo stats, `src/utils/github-content-cache.server.ts:1075-1128` prunes by first collecting all matching keys, and `src/utils/github-content-cache.server.ts:1160-1203` rewrites stale metadata one object at a time.

This is admin-only and probably fine at the current cache size. It will become fragile as docs traffic creates more artifacts, especially because simply visiting the admin tab runs the full stats scan.

Suggested fix: paginate docs cache stats, add a max object/page budget to maintenance actions, make "invalidate all" a queued/background job with progress, and keep per-repo invalidation as the fast synchronous path.

### P2 - Intent admin process limit is uncapped

`src/utils/intent-admin.functions.ts:32-38` accepts an optional number for `limit` with no min/max. `src/utils/intent-admin.server.ts:196-230` passes that limit into queue processing and then synchronously extracts tarballs for each pending version.

This is admin-only, so it is less exposed than public endpoints, but it can still accidentally create a very large synchronous admin action.

Suggested fix: cap the admin process limit, use an integer schema, and route large runs through the scheduled/background queue.

### P2/P3 - Intent admin package lists are all-table reads

The Intent admin page mounts three queries immediately at `src/routes/admin/intent.tsx:56-70`. Two of the server paths are unpaginated list reads: `listIntentPackages` loads every package and a full grouped version-count table at `src/utils/intent-admin.server.ts:82-126`, and `listFailedVersions` loads every failed version at `src/utils/intent-admin.server.ts:132-139`. The UI renders both lists directly at `src/routes/admin/intent.tsx:327-340`, `src/routes/admin/intent.tsx:470-527`, and `src/routes/admin/intent.tsx:553-610`.

The stats query also polls every 10 seconds at `src/routes/admin/intent.tsx:56-60`, and each poll runs six count queries in `src/utils/intent-admin.server.ts:40-66`. This is admin-only, but it will get slower exactly when discovery/processing problems create lots of queued or failed versions. Suggested fix: paginate packages and failed versions independently, cap failure history, pause polling when the tab is hidden, and make the stats query the only eager full-page query.

### P3 - Admin row mutations are not consistently keyed by row

The GitHub stats admin page has the right local shape: it stores `refreshingKey` at `src/routes/admin/github-stats.tsx:63`, checks that key per row at `src/routes/admin/github-stats.tsx:284-293`, and disables only the row being refreshed plus the global refresh button.

Other row actions use one mutation state for the whole list. `src/routes/admin/npm-stats.tsx:77-89` creates one package refresh mutation, and every package row disables/spins from `refreshPackageMutation.isPending` at `src/routes/admin/npm-stats.tsx:252-264`. `src/routes/admin/intent.tsx:460-468` creates one failed-version retry mutation for the whole failed table, and every retry button disables from `retryMutation.isPending` at `src/routes/admin/intent.tsx:514-518`.

This is mostly UX/maintainability, but it also makes admin operations feel blocked when only one row is busy. Suggested fix: extract a small keyed row-action helper that tracks the active id(s), exposes `isPendingFor(id)`, and prevents double-clicks per row without freezing unrelated rows.

### P3 - Intent GitHub discovery treats one search page as complete

`discoverViaGitHub` calls GitHub code search with `per_page=100` at `src/utils/intent-admin.server.ts:285-299`, then iterates only `searchData.items` at `src/utils/intent-admin.server.ts:301-388`. The scheduled discovery path repeats the same one-page query at `src/server/scheduled.server.ts:230-249`. Both paths read or type a response shape that can include more results, but repositories beyond the first search page are silently ignored. The admin path uses raw `fetch` calls for GitHub content and npm metadata at `src/utils/intent-admin.server.ts:324-359`, and the scheduled path does the same at `src/server/scheduled.server.ts:287-314`, without the shared timeout/status/body-size policy recommended for outbound calls.

Suggested fix: either make this explicitly "sample the first 100" in the UI/result copy, or paginate with a tight max page budget and record truncation in the result banner. Route GitHub/npm calls through the outbound fetch helper.

### P2 - Example deploy accepts arbitrary source repo/path without volume caps

`src/routes/api/example/deploy.ts:115-164` reads `sourceRepo`, `branch`, `examplePath`, `provider`, `libraryName`, and `exampleName` from raw JSON. It validates the destination repo name, but the source repo/path and provider contract are not parsed through a runtime schema or allowlist before fetching files.

`src/utils/github-example.server.ts:38-80` loads the recursive tree and fetches every matching file with concurrency 8. It excludes common directories, but there is no max file count, max file size, or total byte cap. `src/utils/github-example.server.ts:47-52` matches by a normalized path prefix, while `src/routes/api/example/deploy.ts:160-164` prepends `examples/` to raw request input, so this should also reject `..`, duplicate slashes, and unexpected prefixes before any GitHub work starts.

Provider handling also depends on compile-time types only. `src/routes/api/example/deploy.ts:129-183` passes raw `provider` into `applyProviderConfig`; `src/utils/provider-config.server.ts:39-52` silently returns empty config for unknown values, while `src/utils/provider-config.server.ts:408-420` renders `undefined` in generated repo descriptions for unknown providers. The same helper rewrites `package.json` and `vite.config.*` through best-effort JSON/string transforms at `src/utils/provider-config.server.ts:257-403`, including hard-coded npm scripts for generated provider configs.

This endpoint is authenticated and IP-rate-limited, so the exposure is lower than fully public routes. It can still make a logged-in request do a large amount of GitHub/cache work and then create a repository.

Suggested fix:

- Use a deploy request schema with source repo/ref/path allowlists.
- Validate provider with a picklist.
- Treat unsupported provider config as a hard validation error, not an empty config path.
- Move provider config generation to structured package/config writers where possible, and preserve the detected package manager instead of hard-coding npm scripts.
- Normalize and cap example paths, fetched file count, per-file bytes, and total copied bytes.
- Return stable public error codes instead of surfacing upstream fetch messages.

### P2 - Builder GitHub deploy trusts client-supplied files without a file budget

`src/routes/api/builder/deploy/github.ts:149-215` reads JSON without a content-length guard, accepts an optional `files` record, and if every value is a string, pushes those files instead of compiling the project server-side. `src/utils/github-repo.server.ts:241-490` then turns every entry into GitHub tree content without path, file-count, per-file-size, or total-byte validation.

The endpoint is authenticated and rate-limited, but it is still a state-changing GitHub integration that can be made to process and push arbitrary large client-supplied file maps.

`src/routes/api/builder/deploy/check-name.ts:45-54` also checks GitHub availability without a route-level rate limit and returns `available: true` on upstream errors. The final create step handles conflicts, so this is mostly UX, but the availability endpoint should not fail open silently.

The shared GitHub repo helper also has operational gaps. `src/utils/github-repo.server.ts:35-101` creates the repository with no timeout, `src/utils/github-repo.server.ts:270-490` performs a multi-request push with no timeout or retry policy, and both deploy routes create the repo before pushing files (`src/routes/api/builder/deploy/github.ts:217-267`, `src/routes/api/example/deploy.ts:185-243`). If the push fails, the API returns a failure but leaves the newly-created repository behind. `pushFiles` also treats any failed branch-ref lookup as an empty repo at `src/utils/github-repo.server.ts:270-276`; rate limits, auth errors, transient GitHub errors, and a genuinely missing branch all take the same bootstrap path.

Suggested fix:

- Prefer server-side compilation as the only deploy source, or validate client-generated files against a builder output manifest.
- Add file path normalization, file count, total bytes, and per-file bytes caps before `pushFiles`.
- Add request-size and same-origin guards to deploy routes.
- Rate-limit `check-name` and return an explicit unknown/error state instead of `available: true`.
- Wrap GitHub repo creation/push in a deploy transaction concept: deadlines on every fetch, typed retryable errors, and explicit cleanup/continuation UX when repo creation succeeds but file push fails.

### P2 - Deploy dialogs repeat async workflows without cancellation boundaries

`src/components/builder/DeployDialog.tsx:115-163` and `src/components/ExampleDeployDialog.tsx:70-118` duplicate debounced repository-name checks. Both then run long deployment actions through `handleDeploy` without an `AbortController` or mounted guard:

- builder deploy compiles and posts client-supplied files at `src/components/builder/DeployDialog.tsx:216-273`
- example deploy posts source repo/path metadata at `src/components/ExampleDeployDialog.tsx:171-213`

Closing the dialog does not cancel in-flight compile/fetch work. When the request eventually resolves, it can still move hidden UI into success/error state. `useDeployAuth` also starts popup-close polling at `src/components/builder/useDeployAuth.ts:81-90` without clearing that interval if the component unmounts while the popup stays open.

Suggested fix:

- Extract a shared deploy-dialog controller for auth refresh, repo-name validation, debounced availability checks, deployment status, countdown, and provider redirect.
- Add `AbortController` support to deployment fetches and close-dialog cleanup.
- Track and clear popup polling intervals in `useDeployAuth`.
- Make the name-check helper return typed response/error states and apply rate-limit-aware UI messaging.

### P3 - Netlify starter action never reports pending state

`src/components/application-builder/useApplicationBuilder.tsx:740-819` opens a pending Netlify deploy window, may mutate selected partners, and may call `resolveSubmittedInput` before navigating the popup. The hook then exports `isGeneratingNetlify = false` unconditionally at `src/components/application-builder/useApplicationBuilder.tsx:922-926`.

`src/components/ApplicationStarter.tsx:883-905` uses that flag to disable/show loading state for the Netlify action, so the real in-flight work is invisible to the UI after the short transient "Opening..." timer. Users can click again while prompt resolution is still in flight, and the code relies on popup behavior rather than component state to prevent duplicate work.

Suggested fix: add real `isGeneratingNetlify` state around `openNetlifyStart`, clear it in `finally`, and gate repeat clicks with the same state used for prompt generation.

### P2/P3 - Builder copy/transient feedback timers are inconsistent

`src/components/ApplicationStarter.tsx:227-240` tracks the transient action timer and clears it on unmount at `src/components/ApplicationStarter.tsx:428-434`. The newer hook repeats similar state at `src/components/application-builder/useApplicationBuilder.tsx:385-394` with an untracked `setTimeout`, so it can update state after unmount and is harder to reuse.

`src/components/application-builder/useApplicationBuilder.tsx:415-445` also calls `navigator.clipboard.writeText` without handling denied clipboard permission, insecure contexts, or unavailable clipboard APIs. That means copy actions can fail silently from the user's perspective unless the caller happens to catch the returned promise.

Suggested fix:

- Extract a `useTransientFlag` or `useTimedState` helper that owns timer cleanup.
- Extract a `copyToClipboard` helper that handles unsupported/denied clipboard writes and emits one consistent toast/error path.
- Reuse both in builder, starter, search copy buttons, and docs/examples copy controls.

### P3 - Application-starter resolve has a schema/behavior caveat

`src/routes/api/application-starter/resolve.ts:100-119` detects `rawBody.mode === 'analyze'`, but `applicationStarterRequestSchema` at `src/utils/application-starter.server.ts:14-17` only validates `context` and `input`. Because Zod strips unknown keys, the mode works outside the explicit request contract.

The same endpoint has strong public guards, but `src/routes/api/application-starter/resolve.ts:168-178` returns `details: error.message` on public POST errors.

Suggested fix: use a discriminated schema or separate endpoints for resolve vs analyze, and return stable public error codes/messages while logging internal details server-side.

### P2/P3 - Anonymous application-starter quota is wired but effectively disabled

`src/routes/api/application-starter/resolve.ts:124-150` blocks unauthenticated generations after `RATE_LIMITS.applicationStarterAnonymousDaily` is exceeded and returns `LOGIN_REQUIRED_FOR_MORE_GENERATIONS`. The configured daily limit is `1_000_000` at `src/utils/rateLimit.server.ts:179-183`, even though the comment says this is the number of anonymous generations before login is required. The status endpoint also reports that limit to the UI at `src/routes/api/application-starter/resolve.ts:16-35` and `src/routes/api/application-starter/resolve.ts:38-66`.

That makes the login gate mostly cosmetic while still writing daily quota rows for every anonymous generation. If the intended product behavior is a real anonymous sample quota, this should be a small integer in config. If the intended behavior is no anonymous quota, remove the quota branch and UI copy so the security and product contracts match.

Suggested fix: move the anonymous generation quota to a named environment/config value, set an explicit product limit, and test the transition from anonymous usage to login-required state.

### P3 - Application-starter control markers share the user prompt channel

`src/utils/partners.tsx:266-334` stores selected partners, inferred partners, router-only mode, and guidance in plain text markers appended to the user's prompt. The resolver then treats those markers as control data: `src/utils/application-starter.ts:529-536` extracts partner IDs from the full input, `src/utils/application-starter.ts:974-980` checks `Force router-only: true`, and `src/utils/application-starter.ts:1119-1121` splits the prompt into user brief plus guidance lines.

`src/components/application-builder/shared.ts:206-232` composes those markers for the UI, but raw public resolve requests and hand-written prompts can also include the same strings. A prompt containing `Starter guidance:`, `Selected partner ids:`, `Inferred partner ids:`, or `Force router-only: true` can truncate the analyzed user brief or change deterministic routing/partner behavior.

Suggested fix: keep control metadata out of the prompt string. Make selected/inferred partner ids, router-only mode, migration repo, package manager, and guidance explicit schema fields, then render them into the generated prompt only after validation.

### P3 - Application-starter partner visibility has a dead selection parameter

`src/components/application-builder/useApplicationBuilder.tsx:162-168` computes `visiblePartnerSuggestions` by passing `selectedPartners` into `getApplicationStarterVisiblePartnerSuggestions`, but `src/utils/partners.tsx:1379-1384` ignores that parameter and always returns the full suggestion list. The current UI still mutes conflicts in `StarterPartnerRows` at `src/components/application-builder/parts.tsx:369-394`, so this is not currently a correctness bug.

The risk is contract drift: the helper name and signature imply that selected partners affect visibility, while the actual conflict behavior lives in a separate row component and toggle reducer (`src/components/application-builder/useApplicationBuilder.tsx:327-350`). Future surfaces can call the helper and assume conflicts are hidden or reordered when they are not.

Suggested fix: either remove the helper and pass `partnerSuggestions` directly, or make it the single source of partner visibility/muting state by returning typed `{ partner, selected, muted, conflicts }` rows used by both builder and starter UI.

### P2/P3 - Application-starter ecommerce recipes lose the Shopify template in builder/download URLs

The deterministic ecommerce recipe sets `recipe.template = 'shopify-storefront'` at `src/utils/application-starter.ts:695-696`. The CLI path handles that specially: `isCliTemplateId` recognizes `shopify-storefront` at `src/utils/application-starter.ts:1237-1241`, and `buildCliCommand` emits `--template shopify-storefront` at `src/utils/application-starter.ts:1282-1284`.

The URL paths do not preserve the same contract. `buildAdvancedBuilderUrl` serializes `template=shopify-storefront` at `src/utils/application-starter.ts:1208-1234`, but the builder URL loader only calls `setTemplate(search.template)` at `src/components/builder/useBuilderUrl.ts:69-72`. `setTemplate` only accepts preset ids from `TEMPLATES` at `src/components/builder/store.ts:291-315`; the preset id is `storefront`, while its `exampleId` is `shopify-storefront` at `src/builder/templates.ts:119-125`. So the advanced builder link can fall through to the default blank template. `buildDownloadUrl` also omits template/example state entirely at `src/utils/application-starter.ts:1298-1314`, and the in-browser download path maps recipes through `recipeToProjectInput` without selected examples at `src/components/builder/client-generation.ts:28-39`. An ecommerce starter download can therefore lose the Shopify storefront example even though the CLI command is correct.

Suggested fix: give starter recipes separate `presetTemplateId` and `cliExampleId` fields, or make all URL/download/apply paths consume the same recipe-to-builder normalization helper. At minimum, map `shopify-storefront` to the `storefront` preset for `/builder` and pass selected examples into the download API.

### P2/P3 - Application-starter responses are cast instead of parsed

The API route parses request bodies with `applicationStarterRequestSchema` at `src/routes/api/application-starter/resolve.ts:114-120` and `src/utils/application-starter.server.ts:14-17`, but the client response boundary is weaker. `resolveApplicationStarter` casts JSON directly to `ApplicationStarterResult` at `src/components/application-builder/shared.ts:323-328`, and `analyzeApplicationStarter` casts JSON directly to `ApplicationStarterAnalysis` at `src/components/application-builder/shared.ts:343-355`. The same file already has a runtime guard for the status response at `src/components/application-builder/shared.ts:358-380`, so the inconsistency is local.

If the deterministic resolver changes shape, a proxy error returns HTML/partial JSON, or a field such as `prompt` is missing, the UI can fail after the boundary instead of returning one typed application-starter error.

Suggested fix: export response schemas next to the request schema, parse both server outputs and client reads with them, and keep `ApplicationStarterError` as the only UI-facing failure shape.

### P2 - OAuth public endpoints need shared body and metadata guards

`src/routes/oauth/register.ts:28-69` reads arbitrary JSON and accepts uncapped client names and redirect URI arrays. `src/routes/oauth/token.ts:28-47` reads form or JSON bodies without a content-length cap. `src/routes/oauth/authorize.tsx:38-46` and `src/utils/oauthClient.functions.ts:48-57` accept OAuth metadata as raw strings with no length or shape constraints beyond redirect URI validation.

The first-party OAuth routes have similar loose boundaries. `src/routes/auth/$provider/start.tsx:22-58` casts `provider`, accepts raw `returnTo`, and splits raw `scope` query values into GitHub scopes without a picklist or length cap. `src/routes/api/auth/callback/$provider.tsx:40-45` casts the callback provider and treats every non-GitHub provider as Google at `src/routes/api/auth/callback/$provider.tsx:105-133`.

The callback also clears OAuth state/return cookies only on the success path at `src/routes/api/auth/callback/$provider.tsx:221-234`. Missing code/state, state mismatch, provider errors, and thrown provider-fetch errors redirect back to login without clearing those short-lived cookies.

Provider response validation is inconsistent. GitHub token/profile reads go through `parseOAuthJson` and field checks at `src/auth/oauth.server.ts:302-327` and `src/auth/oauth.server.ts:344-412`, while Google token/profile reads call `.json()` directly and trust raw properties at `src/auth/oauth.server.ts:438-453` and `src/auth/oauth.server.ts:471-485`.

Refresh also drops scope information. Initial access tokens store `authCode.scope` at `src/auth/oauthClient.server.ts:219-228`, but refresh tokens do not store scope in the schema at `src/db/schema.ts:1079-1107`. `refreshAccessToken` then mints new access tokens with hard-coded `scope: 'api'` at `src/auth/oauthClient.server.ts:289-312`.

The cleanup index policy also drifts. Authorization codes and access tokens both index `expiresAt` at `src/db/schema.ts:1018-1021` and `src/db/schema.ts:1059-1065`, but refresh tokens have `expiresAt` at `src/db/schema.ts:1093-1096` with no matching index. `cleanupExpiredOAuthTokens` deletes refresh tokens by expiry at `src/auth/oauthClient.server.ts:432-441`, so that cleanup becomes a table scan as connected clients accumulate.

Suggested fix:

- Add shared OAuth metadata schemas for `client_id`, redirect URIs, code challenge, verifier, scope, and state.
- Add request-size guards on register/token.
- Enforce `code_challenge_method: 'S256'` at the server-function boundary, not only in the authorize route loader.
- Add a first-party auth-start schema with a provider picklist, return-to length cap, same-origin/path-only normalization, and scope picklist.
- Clear state/popup/return cookies on all callback exits, not only successful login.
- Parse provider token/profile responses through one typed helper with status/content-type/body handling.
- Store refresh-token scope or join back to the previous access-token scope when minting refreshed access tokens.
- Add an `expiresAt` index for OAuth refresh tokens before relying on global cleanup.

### P2 - OAuth user/account upsert is not transactional

`OAuthService.upsertOAuthAccount` checks for an OAuth account, optionally finds or creates a user, updates user profile fields, and then inserts the OAuth account in separate repository calls at `src/auth/oauth.server.ts:66-192`. The repositories back those calls with separate DB writes at `src/auth/repositories.server.ts:60-101` and `src/auth/repositories.server.ts:193-203`.

Concurrent callbacks for the same provider/email, provider email changes, or an OAuth-account insert failure can leave partial state: a new user without a linked OAuth account, a user profile update without the token update, or a unique-constraint error after several writes have already committed.

Suggested fix: move the upsert/link/create flow into one repository method that runs in a Drizzle transaction, handles unique-conflict retry/lookup, and returns a typed result for "linked existing user", "created new user", and "updated existing OAuth account".

### P2/P3 - Login return-to parameter names are inconsistent

`src/auth/client.ts:76-79` can navigate users to `/login?returnTo=...`, but `src/routes/login.tsx:17-20` validates `redirect`, not `returnTo`, and `LoginPage` renders `<SignInForm />` without passing any return target at `src/routes/login.tsx:104-125`.

`/auth/cli` works around this by rendering `<SignInForm returnTo={returnTo} />` directly at `src/routes/auth/cli.tsx:117-128`. Generic route guards that redirect to `/login` also do not preserve the attempted destination.

Suggested fix: choose one query key, probably `returnTo`, parse it with a same-origin/path-only schema, pass it to `SignInForm`, and update protected-route redirects to preserve the current location where appropriate.

### P2/P3 - Login modal success callbacks survive modal close

`src/contexts/LoginModalContext.tsx:40-51` stores an optional post-login callback and has `closeLoginModal()` clear it, but the provider renders `<LoginModal open={isOpen} onOpenChange={setIsOpen} />` at `src/contexts/LoginModalContext.tsx:75-79`. Radix close, outside-click, and Escape paths can set `isOpen` false without clearing `pendingOnSuccessRef`.

A later `TANSTACK_AUTH_SUCCESS` message from `/auth/popup-success` (`src/routes/auth/popup-success.tsx:9-16`) then runs the stale callback in `src/contexts/LoginModalContext.tsx:53-68`. Callers use this callback for side effects such as newsletter signup, showcase voting, and docs feedback (`src/components/NewsletterSignup.tsx:66`, `src/components/ShowcaseGallery.tsx:185`, `src/components/DocFeedbackProvider.tsx:234`).

The same flow starts auth popups with `window.open` but does not check for a blocked popup at `src/auth/client.ts:38-47`.

Suggested fix: route every modal open-state change through a handler that clears the pending callback when closing, track popup/session request ids in the postMessage payload, and surface blocked-popup failure in `LoginModal`.

### P2 - Draft/future blog posts are hidden from the index but still publicly readable by slug

`src/utils/blog.ts:48-52` excludes drafts and future-dated posts from `getPublishedPosts()`, which feeds `/blog`. `src/utils/blog.functions.ts:65-107` then loads individual posts from `allPosts` by slug, computes `isUnpublished` at `src/utils/blog.functions.ts:94`, and returns the full content anyway. `src/routes/blog.$.tsx:51-56` only uses that flag to emit `noindex`.

Result: an unpublished post is not indexed by the blog list, but anyone with the slug can read it publicly.

Suggested fix: return `notFound()` for `post.draft || !isPublishedDateReleased(post.published)` unless a separate authenticated preview mode is explicitly requested and authorized.

### P3 - Blog image URLs are normalized inconsistently

The blog page head treats any `headerImage` that starts with `http` as already absolute at `src/routes/blog.$.tsx:32-46`; otherwise it sends the path through `getAbsoluteOptimizedImageUrl`. The RSS feed does not share that helper: `src/routes/rss[.]xml.ts:48` renders `<enclosure url="${siteUrl + post.headerImage}" ...>`.

If a post uses an absolute external header image, the page metadata can be correct while RSS emits a malformed URL like `https://tanstack.comhttps://...`. If a relative path needs image optimization or format metadata, RSS bypasses the page helper entirely.

Suggested fix: create one `getBlogImageUrl(headerImage, usage)` helper that URL-parses absolute values, handles same-origin relative paths, applies optimization where appropriate, and returns a MIME type for RSS enclosures instead of hardcoding `image/png`.

### P2 - Shopify browse and cart server functions need caps and an HTML trust boundary

`src/utils/shop.functions.ts:108-205` accepts `first`, cursor, and handle inputs for product/collection/page reads with no max. `src/utils/shop.functions.ts:251-285` accepts uncapped search text and `first`. The public route schemas also leave strings unbounded at `src/routes/shop.index.tsx:18-29` and `src/routes/shop.search.tsx:12-14`; current UI uses `PAGE_SIZE = 24`, but the server-function boundary still accepts larger direct calls. Cart writes accept uncapped variant IDs, line IDs, discount codes, and quantities at `src/utils/shop.functions.ts:324-457`, while client controls can still send arbitrary local quantities through `src/routes/shop.products.$handle.tsx:353-379`, `src/components/shop/ProductDrawer.tsx:625-681`, and `src/routes/shop.cart.tsx:150-170`.

Shopify rich text is rendered with `dangerouslySetInnerHTML` in `src/routes/shop.products.$handle.tsx:400-414`, `src/components/shop/ProductDrawer.tsx:733-742`, `src/routes/shop.pages.$handle.tsx:37-49`, and `src/routes/shop.policies.$handle.tsx:36-48`.

The Shopify image helper has the same loose-transform shape as the Cloudflare helper: `src/utils/shopify-format.ts:27-33` calls `new URL(url)` and appends any numeric width/height without host validation or clamps, and it is used by the product page SEO image at `src/routes/shop.products.$handle.tsx:36-48`, cart thumbnails at `src/routes/shop.cart.tsx:232-240`, drawer thumbnails at `src/components/shop/CartDrawer.tsx:167-175`, and responsive product images at `src/components/shop/ProductImage.tsx:42-56`.

Suggested fix:

- Add a shared shop handle/cursor/query schema and max page size.
- Add quantity and discount-code length caps.
- Use a trusted sanitizer/allowlist for Shopify HTML, or document and enforce a strict trusted-CMS contract.
- Put Shopify fetches behind the same timeout/status helper as other outbound requests.
- Clamp Shopify image transform dimensions/formats and fail gracefully for malformed or non-Shopify image URLs.

### P3 - Shop fonts are loaded twice and disagree on mono family

The shop route injects a Google Fonts stylesheet for `DM Sans` and `JetBrains Mono` at `src/routes/shop.tsx:8-32`. The route also loads `src/styles/shop.css`, which imports Google Fonts again at `src/styles/shop.css:14`, this time for `DM Sans` and `DM Mono`.

The active shop token is `--font-shop-mono: 'DM Mono'` in both `src/styles/app.css:27-28` and `src/styles/shop.css:33-34`, and shop components use `font-shop-mono` throughout. That means `DM Sans` can be requested twice, `DM Mono` is fetched through a CSS `@import`, and `JetBrains Mono` is fetched by the route even though the shop mono token points elsewhere.

Suggested fix: load the shop font families once, preferably through route-level `<link rel="preconnect">`/stylesheet entries for the exact families used by the tokens, and remove the `@import` from `shop.css`.

### P2/P3 - Shop load-more responses can append stale pages

The shop index, collection, and search pages keep cursor pagination in local `accumulated`, `endCursor`, and `hasNextPage` state. They reset that state when loader data changes, but in-flight load-more mutations are not tied to the route/search version that started them:

- `src/routes/shop.index.tsx:63-98` appends `next.nodes` after any `getProducts` response.
- `src/routes/shop.collections.$handle.tsx:75-111` appends `next.products.nodes` after any `getCollection` response.
- `src/routes/shop.search.tsx:47-76` appends `next.products` after any `searchProducts` response.

If a user clicks “Load more” and then changes sort, collection, or search query before the request resolves, the old page can be appended into the new result set. The effect reset only handles loader-data arrival; it does not reject late mutation responses.

Suggested fix: use a route-scoped pagination controller that captures a request fingerprint (`sort`, `handle`, `query`, cursor) in `onMutate` and ignores or aborts responses whose fingerprint no longer matches current loader/search state. That helper should own accumulated pages, cursor state, and reset behavior.

### P3 - Shop "new" badge lasts for a year

`src/components/shop/ProductCard.tsx:8-14` names the freshness window `TWO_WEEKS_MS`, but the value is `365 * 24 * 60 * 60 * 1000`. That means products show the `NEW` badge for roughly a year instead of two weeks.

Suggested fix: set the constant to `14 * 24 * 60 * 60 * 1000`, or rename the constant if the intended merchandising window is actually one year.

### P2/P3 - Product cards eagerly preload every variant image

`src/components/shop/ProductCard.tsx:126-136` preloads every unique variant image on mount so color-hover swaps are instant. Product grids render these cards on the shop index, collection, and search pages at `src/routes/shop.index.tsx:209`, `src/routes/shop.collections.$handle.tsx:156`, and `src/routes/shop.search.tsx:130`.

That can turn one product grid into a large burst of offscreen Shopify image requests before the user hovers a swatch. The hover UX is nicer, but the default should not make every listing page pay for every color image up front.

There is also a correctness edge in the same path. The card builds up to six swatches from option values at `src/components/shop/ProductCard.tsx:116-122`, then finds hover images from `product.variants.nodes` at `src/components/shop/ProductCard.tsx:138-146`. The list fragment only fetches `variants(first: 10)` at `src/utils/shopify-queries.ts:51-100`. Products with size x color variants can have visible swatches whose image-bearing variant is not in the first ten, so hover previews can silently fall back to the featured image.

Suggested fix: either fetch a dedicated color-preview field/list that covers every rendered swatch, or cap rendered swatches to the loaded variant-preview data. Preload only the first few visible/likely swatches, defer preloading until card hover/focus or near-viewport intersection, and put a small per-card/per-page image preload budget behind a shared product-image-hover helper.

### P2/P3 - Quick-view product cards nest real buttons inside a button-like card

When `onQuickView` is provided, `src/components/shop/ProductCard.tsx:241-254` renders a focusable `div role="button"` for the entire card. The card body contains swatch `<button>` elements at `src/components/shop/ProductCard.tsx:193-220`. That creates nested interactive controls on the shop index, collection, and search listing pages. The outer key handler at `src/components/shop/ProductCard.tsx:247-249` also handles Space without `preventDefault`, so keyboard activation can scroll the page while opening quick view.

Suggested fix: make the quick-view target a real link/button with no interactive descendants, or split the card into a non-interactive container with separate explicit swatch and quick-view controls. If Space opens quick view, prevent default before calling the handler.

### P2/P3 - Builder feature cards nest external links inside buttons

`src/components/builder/FeaturePicker.tsx:401-420` renders each add-on card as a `<button>`, but feature cards with docs links render an `<a>` inside that button at `src/components/builder/FeaturePicker.tsx:456-465`. `handleLinkClick` stops React propagation at `src/components/builder/FeaturePicker.tsx:383-385`, but it does not make nested interactive HTML valid or predictable for assistive technology.

The custom builder controls repeat the same nested pattern for docs help links: `src/components/builder/CustomAddonDialog.tsx:211-238`, `src/components/builder/CustomTemplateDialog.tsx:211-234`, and `src/components/builder/CustomTemplateDialog.tsx:303-333` render router links inside buttons.

Suggested fix: split the feature card into a non-interactive row with a dedicated checkbox/toggle button and a sibling external link, or render the whole card as a button only when there is no secondary action.

### P2 - Product drawer cannot add some valid variants

The product page initializes selected options to each option's first value at `src/routes/shop.products.$handle.tsx:59-61`, so a single-variant or single-option product can resolve an exact variant immediately through `src/routes/shop.products.$handle.tsx:418-424`.

The quick-view drawer initializes every option to an empty string at `src/components/shop/ProductDrawer.tsx:400-402`, hides any option with one value at `src/components/shop/ProductDrawer.tsx:414-417` and `src/components/shop/ProductDrawer.tsx:516-518`, then requires an exact selected-option match at `src/components/shop/ProductDrawer.tsx:109-115` and `src/components/shop/ProductDrawer.tsx:412`. If a product has only one variant, or has a single-value option alongside a visible multi-value option, the hidden option remains empty and `selectedVariant` can stay undefined. The drawer can show a price from `variants[0]` at `src/components/shop/ProductDrawer.tsx:436` while keeping Add to Cart disabled at `src/components/shop/ProductDrawer.tsx:658-664`.

Suggested fix: initialize drawer selections the same way as the product page for single-value options, or make `findExactVariant` treat single-value hidden options as preselected. Keep the "user must pick visible multi-value options" rule separate from variant resolution.

### P3 - Cart optimistic updates rely on a module counter and a casted line shape

`src/hooks/useCart.ts:35-55` tracks all cart mutations with a module-level `cartMutationsInFlight` counter. That is simple for a single browser QueryClient, but it is disconnected from QueryClient lifetime and can drift under HMR, tests, or future multi-client usage.

`src/hooks/useCart.ts:136-159` builds an optimistic cart line and casts it to `CartLineDetail`, hiding whether the optimistic shape actually satisfies the storefront query type.

Suggested fix: keep the “invalidate once idle” behavior, but scope the counter to a hook/controller instance or use React Query mutation cache state intentionally. Define an explicit optimistic cart-line construction helper that returns a typed shape without casts.

### P3 - Product add-to-cart UI claims success before the mutation succeeds

The product page opens the cart drawer and flips the button to the added state before the server mutation resolves: `src/routes/shop.products.$handle.tsx:347-379` sets `showAdded`, opens the drawer, and then calls `addToCart.mutate(...)`. `src/components/shop/ProductDrawer.tsx:625-681` follows the same pattern. `useAddToCart` does roll the cart cache back on mutation error at `src/hooks/useCart.ts:180-183`, but the local success state and opened drawer are not tied to `onSuccess`.

This is mostly a correctness/UX issue, but it will be visible when Shopify rejects a quantity, variant, cart, or network request. Suggested fix: use `mutateAsync` or hook-level `onSuccess`/`onError` callbacks so the drawer/success affordance reflects server state, while still preserving an explicit optimistic cart line if that UX is intentional.

### P3 - Product quick-view drawer is modal-like but not modal

`src/components/shop/ProductDrawer.tsx:238-336` renders a blocking scrim and slide-over product drawer, listens for Escape at `src/components/shop/ProductDrawer.tsx:192-202`, and marks the drawer `aria-hidden` while closed, but the open surface is an `<aside aria-label="Product detail">` with no `role="dialog"`, no `aria-modal`, no initial focus, no focus trap, and no focus restoration. The cart drawer already uses Radix Dialog at `src/components/shop/CartDrawer.tsx:25-72`, so the product drawer has weaker modal semantics than the adjacent cart flow.

The resize affordance has a similar semantic gap. `src/components/shop/ProductDrawer.tsx:272-280` uses `role="separator"` for a drag handle, but it is mouse-only and does not expose `aria-orientation`, `aria-valuemin`, `aria-valuemax`, `aria-valuenow`, or keyboard resizing.

Suggested fix: move product quick view onto the same Radix Dialog/sheet primitive as the cart drawer, and make the resize handle either a fully keyboard-operable separator or a visual-only mouse handle with a separate preset-width control.

### P3 - Product page assumes Shopify products always have option values and variants

`src/routes/shop.products.$handle.tsx:59-61` initializes selected options with `o.values[0]!`, so a malformed or unusual Shopify option with no values is treated as selected. The JSON-LD writer then assumes at least one variant: `src/routes/shop.products.$handle.tsx:434-468` builds `AggregateOffer` with `Math.min(...product.variants.nodes.map(...))`, `Math.max(...)`, and a first-variant currency fallback.

Most Shopify products have a default variant, but this route is a public rendering boundary for external catalog data. A zero-variant or empty-option product would produce `Infinity`/`-Infinity` before JSON serialization, unstable selected-option state, and misleading product structured data.

Suggested fix: normalize product details at the Storefront boundary. Require at least one purchasable/default variant before rendering the product route, filter empty option values, and make `ProductJsonLd` emit no offer or a clear unavailable offer when the normalized variant list is empty.

### P2 - Public pagination schemas often have minimums but no maximums

Examples:

- `src/routes/showcase/index.tsx:8-15` and `src/utils/showcase.functions.ts:190-213`
- `src/utils/showcase.functions.ts:218-248`
- `src/utils/showcase.functions.ts:757-788`
- `src/routes/feedback-leaderboard.tsx:7-13` and `src/utils/docFeedback.functions.ts:448-526`
- `src/routes/stats/npm/index.tsx:57-86`

This repeats across public and admin surfaces. Some routes only render UI-selected values, but server functions should enforce caps independently.

Suggested fix: create shared `boundedPaginationSchema`, `boundedStringFilterSchema`, and `boundedUuidArraySchema` helpers and use them at the server-function boundary.

### P2/P3 - Type casts hide route and schema drift

The codebase has repeated `as any`, `as never`, and route-param enum casts where the right fix is usually a route/schema boundary. Representative examples:

- `src/components/LibraryLayout.tsx:824`, `src/components/LibraryLayout.tsx:982`, and `src/components/LibraryLayout.tsx:1323`
- `src/routes/libraries_.$framework.tsx:53`
- `src/components/LibraryCard.tsx:12` with callers casting `LibrarySlim` to `Library` at `src/routes/libraries.tsx:91-114` and `src/routes/libraries_.$framework.tsx:141-144`
- `src/components/LibraryCard.tsx:171-176`, where a CSS custom property is written through `as any` instead of a typed style object
- `src/routes/index.tsx:184-193`, where `Object.entries(librariesByGroup)` loses the group/library relationship and the render path casts both values back
- `src/components/FrameworkSelect.tsx:139-146`
- `src/routes/maintainers.tsx:205-233`, where select values are cast instead of typed through ids/picklists, and `src/routes/maintainers.tsx:392-405`, where library ids are cast during filtering
- `src/routes/partners.index.tsx:297-300`, where partner library strings are cast to `Library['id']` after the route search already has a library schema
- `src/libraries/maintainers.ts:580-692`, where public maintainer helper APIs accept `libraryId: string` and repeatedly cast to `Library['id']`
- `src/routes/workshops.tsx:50-55`, where filtering and slicing `allMaintainers` is cast back to `Maintainer[]` instead of preserving the inferred maintainer type or using a typed `workshopsAvailable` selector
- `src/components/builder/store.ts:92`
- `src/components/builder/BuilderProvider.tsx:31-48`
- `src/components/builder/FeaturePicker.tsx:596`
- `src/routes/_library/$libraryId/$version.docs.framework.$framework.index.tsx:17-42`
- `src/routes/_library/$libraryId/$version.docs.community-resources.tsx:19-33`
- `src/routes/_library/$libraryId/$version.docs.blog.tsx:27-29`
- `src/libraries/react-charts.ts:3-12`, where an incomplete deprecated-library object is cast to `Library` even though required fields such as `borderStyle`, `repo`, `frameworks`, and version data are absent
- `src/routes/blog.index.tsx:74`
- `src/hooks/useCart.ts:159`
- `src/routes/admin/users.tsx:289`
- `src/components/ShowcaseDetail.tsx:218-315`, where `libraryMap.get(libId as LibraryId)` and `lib!` non-null assertions compensate for `filter(Boolean)` losing the library type
- `src/routes/admin/showcases_.$id.tsx:229-231` and `src/routes/admin/showcases_.$id.tsx:697-703`, where `filter(Boolean)` is followed by `lib!`, plus `src/routes/admin/showcases_.$id.tsx:774-783`, where a select value is cast to `ShowcaseStatus`
- `src/routes/admin/route.tsx:64` and `src/routes/admin/route.tsx:186-188`, where a details ref is initialized with `null!` and then passed through `as any`
- `src/routes/intent/registry/index.tsx:174` and `src/routes/intent/registry/index.tsx:518`
- `src/routes/_library/$libraryId/$version.tsx:18`
- `src/routes/_library/$libraryId/index.tsx:7`
- `src/routes/-library-landing.tsx:33-41`, where `version!` is used after fallback validation instead of carrying a narrowed route version value
- `src/routes/_library/$libraryId/route.tsx:8-12`, where params are cast before the library id is validated
- `src/routes/_library/$libraryId/$version.tsx:16-19`, `src/routes/_library/$libraryId/$version.tsx:32-35`, and `src/routes/_library/$libraryId/$version.tsx:52-54`, where route params and links are pushed through `as never` and `version!`
- `src/routes/_library/$libraryId/$version.docs.framework.$framework.index.tsx:17` and `src/routes/_library/$libraryId/$version.docs.framework.$framework.index.tsx:42`, where framework params are cast instead of parsed once at the route boundary
- `src/routes/intent/registry/$packageName.tsx:145-148`, where route params are cast loosely before decoding the package slug
- `src/routes/intent/registry/$packageName.index.tsx:528-532`, where `prevVersionMap.get(entry.version)!` assumes a modified changelog entry always has an earlier version
- `src/components/BottomCTA.tsx:25`
- `src/utils/auth.server.ts:57`
- `src/auth/repositories.server.ts:125`, `src/auth/repositories.server.ts:247-258`, and `src/auth/repositories.server.ts:296-305`
- `src/utils/stats-admin.server.ts:27-28`
- `src/components/npm-stats/npmQueryOptions.ts:76-92`, where public bulk stats results are mapped through `any` instead of a typed response schema from `fetchNpmDownloadsBulk`
- `src/mcp/tools/npm-stats.ts:178-192`, where cached npm download results are mapped through `any` instead of a typed response schema from `fetchNpmDownloadsBulk`
- `src/components/npm-stats/PackagePills.tsx:130-137`, where a Radix dropdown select event is cast through `unknown` to `React.MouseEvent` to reuse color-picker positioning
- `src/hooks/useClickOutside.ts:55`
- `src/utils/utils.ts:217`
- `src/builder/api/compile.ts:116-121` and `src/builder/api/compile.ts:174-180`

Several casts are compensating for TanStack Router params/search not being typed at the route boundary, or for validators accepting plain strings and narrowing later. A few are just local component type drift: `LibraryCard` only reads `LibrarySlim` fields, but requires the heavier `Library` type, forcing browse pages to cast. The deprecated `reactChartsProject` case is the inverse: a partial object is made to look complete through a cast rather than a smaller type or explicit deprecated-card contract.

Suggested fix: add shared route-param/search schemas for libraries, framework, version, package, and feature ids; remove link `params as never` usages by using typed route helpers; and treat `as any` in server utilities as an audit failure unless isolated behind a parser.

### P3 - Stack category library lookups fail open to the wrong product

`src/components/stack/CategoryArticle.tsx:117-118`, `src/components/stack/CategoryArticle.tsx:270-273`, `src/components/stack/CategoryArticle.tsx:397-399`, `src/components/stack/CategoryArticle.tsx:612-613`, and `src/components/stack/CategoryArticle.tsx:780-783` all request specific library IDs from the current category library list. The helper at `src/components/stack/CategoryArticle.tsx:1134-1151` returns `libraries[0]` when the requested ID is missing.

That fallback keeps the page rendering, but it can silently link a Start block to Router, or a Devtools block to Config, if `src/components/stack/stack-categories.ts:13-122` or the library grouping changes. These are static editorial invariants, so a wrong page is worse than an obvious development failure.

Suggested fix: replace the fallback with `requireCategoryLibrary(slug, libraryId)` that throws a descriptive invariant error in development/build-time checks, or define each category page from a typed tuple of expected library IDs and derive the render data from that tuple.

### P3 - Stack category related posts are not sorted across libraries

`src/components/stack/CategoryArticle.tsx:78-82` builds category related posts by flattening each library's posts and then immediately slicing to four items. The UI labels the block as recent writing at `src/components/stack/CategoryArticle.tsx:940-945`, but the list is ordered by category library order first, not by `post.published` across all matched posts.

That can make a category page show older posts from the first library while newer posts from later libraries are excluded.

Suggested fix: sort the flattened list by parsed `post.published` descending before the slice, and keep invalid dates at the end.

### P3 - Maintainer role helpers fail open to Contributor

The maintainer helper APIs accept a plain `libraryId: string` and cast it before membership checks at `src/libraries/maintainers.ts:580-692`. `getRoleInLibrary` then returns `'Contributor'` as the default at `src/libraries/maintainers.ts:695-700` even when the person has no relationship to that library or the library id is invalid.

`RoleBadge` trusts that helper directly at `src/components/MaintainerCard.tsx:12-50`, so any future caller that passes a mistyped library id or renders a maintainer outside the filtered contributor list can label the person as a contributor instead of showing no role or throwing an invariant.

Suggested fix: type these helper parameters as `Library['id']`/`LibraryId`, parse route strings once at the boundary, and make `getRoleInLibrary` return `undefined` or a typed union without a contributor fallback when there is no matching role.

### P3 - Public library catalog uses a one-off hidden-library filter

`src/routes/api/data/libraries.ts:12-30` exposes machine-readable library metadata by filtering `libraries` to `lib.to && lib.id !== 'mcp'`. The source data already has a visibility flag: `mcp` is hidden at `src/libraries/libraries.ts:791`, and `workflow` is also hidden at `src/libraries/libraries.ts:854`. Because the API hard-codes only `mcp`, `workflow` is still included in `/api/data/libraries` whenever it has a `to` value.

The showcase submit form has another one-off selector at `src/components/ShowcaseSubmitForm.tsx:20-24`: it keeps any library with a name and excludes only `react-charts` and `create-tsrouter-app`. The showcase gallery filter uses a third selector at `src/components/ShowcaseTopBarFilters.tsx:22-31`: it applies `visible !== false` but then slices to the first 10 libraries. These selectors can drift from the public catalog and from hidden-library intent in different ways.

Suggested fix: centralize a `getPublicLibraries()` or `isPublicLibrary()` helper that applies `visible !== false`, route availability, sitemap inclusion, and any machine-readable catalog rules once, then reuse it in navigation, sitemaps, data APIs, partner/category pages, and LLM indexes.

### P3 - Partner detail pages hardcode volatile claims as code

`src/routes/partners.railway.tsx:32-39` defines campaign URLs, `src/routes/partners.railway.tsx:58-252` hardcodes feature, pricing, capacity, testimonial, and FAQ claims, and `src/routes/partners.railway.tsx:429-443`, `src/routes/partners.railway.tsx:584-658`, `src/routes/partners.railway.tsx:661-703`, and `src/routes/partners.railway.tsx:747-760` render those claims directly.

That is fine for a short-lived campaign page, but pricing, resource limits, log retention, credits, customer quotes, and "faster/cheaper" claims are time-sensitive. Keeping them as route constants makes drift harder to audit and impossible to validate separately from code review.

Suggested fix: move volatile partner-page facts into typed partner content data with source URL, last-verified date, and optional expiry/review date. Add a small validation check that flags expired partner claims during content audits.

### P3 - Partner rotation analytics sends high-cardinality session seeds

`src/routes/__root.tsx:156-158` creates a random `partnerPlacementSessionSeed` for the root loader. `src/utils/usePartnerPlacementContext.ts:20-34` turns that into a surface-scoped rotation seed, `src/utils/partner-placement.ts:76-80` preserves the raw seed in the surface string, and `src/utils/partner-placement.ts:331-339` includes it in partner analytics metadata.

That metadata is spread into impression and click events in surfaces such as `src/components/RightRail.tsx:213-253`, and the event schema allows `rotation_seed` at `src/utils/analytics/events.ts:81-103`. This makes every session/surface produce a mostly unique analytics value. It can help reproduce ordering, but it is high-cardinality data and can act like a session-level identifier in GA4 exports.

Suggested fix: do not send the raw rotation seed to analytics. Send a bounded bucket/cohort id, an algorithm version, and the visible `slot_index`/tier data instead. If exact seed replay is needed, keep it dev-only or behind an internal debug channel.

### P3 - Workshop instructor rotation turns a static page into request-time work

`src/routes/workshops.tsx:23-29` exposes a server function solely to return a 10-second seed. The route sets `staleTime: 0` and calls it in the loader at `src/routes/workshops.tsx:31-36`, then uses that seed to shuffle/slice instructors at `src/routes/workshops.tsx:47-55`.

That makes a mostly static marketing page refetch on every navigation and creates cache churn for cosmetic ordering. Use a build/static order, a daily seed, or a client-only shuffle after hydration if freshness matters.

### P2/P3 - Dynamic Tailwind color tokens are being modified as strings

Library and framework color tokens are stored as Tailwind class strings. That is fine when the exact token is rendered, but several components append opacity or hover variants dynamically:

- `src/routes/maintainers.tsx:256-266` and `src/routes/maintainers.tsx:285-290`
- `src/routes/partners.index.tsx:238-248`
- `src/components/MaintainerCard.tsx:53-59`
- `src/components/MaintainerCard.tsx:93-103`

Some `library.bgStyle` values contain multiple classes, for example `bg-black dark:bg-gray-100` at `src/libraries/libraries.ts:459-464`, `src/libraries/libraries.ts:698-704`, and nearby library definitions. Appending `/40` to the whole string produces invalid fragments like `bg-black dark:bg-gray-100/40`, and dynamic strings such as `hover:${bgStyle}/40` are fragile for Tailwind extraction.

Suggested fix: stop treating Tailwind class strings as composable color values. Store structured tokens (`base`, `muted`, `hover`, `textOnColor`, `darkBase`) or CSS variables, and expose a `getLibraryColorClasses(library, variant)` helper used by maintainers, partners, blog badges, library cards, and future filter chips.

### P2 - MCP rate-limit uniqueness ignores identifier type

`src/db/schema.ts:951-975` defines `mcpRateLimits` with `identifierType`, but the unique index at `src/db/schema.ts:968-970` only covers `(identifier, windowStart)`. `src/mcp/auth.server.ts:175-188`, `src/mcp/auth.server.ts:227-240`, and `src/utils/rateLimit.server.ts:131-145` all use the same conflict target.

If two identifier spaces ever collide, they share a bucket. This is unlikely for UUID-style ids, but it is a schema mismatch.

The cleanup policy also assumes all buckets are short. `cleanupRateLimits` deletes rows where `windowStart` is older than two hours at `src/mcp/auth.server.ts:253-258`, but `checkIpWindowRateLimit` supports arbitrary windows and `RATE_LIMITS.applicationStarterAnonymousDaily` uses a 24-hour window at `src/utils/rateLimit.server.ts:119-183`. If the anonymous daily limit is lowered from its current placeholder value, a random MCP cleanup after the first two hours of the day can reset the daily bucket.

Suggested fix: make `(identifierType, identifier, windowStart)` the unique key and conflict target. Cleanup should delete rows based on each bucket's reset time or use separate tables/helpers for minute, hour, and day limits.

### P2/P3 - MCP API keys need lifecycle caps and lower write amplification

`src/utils/mcpApiKeys.functions.ts:51-106` caps active keys at 10, but it only counts active keys at `src/utils/mcpApiKeys.functions.ts:65-75`. A user can create and revoke keys repeatedly, leaving unbounded inactive rows that `listMcpApiKeys` returns all at `src/utils/mcpApiKeys.functions.ts:19-44`.

`expiresInDays` only has `minValue(1)` at `src/utils/mcpApiKeys.functions.ts:59`, so very large values can create far-future or invalid dates at `src/utils/mcpApiKeys.functions.ts:79-81`.

`src/mcp/auth.server.ts:137-141` updates `lastUsedAt` on every successful API-key request. At high request rates, that becomes one DB write per authenticated MCP request, separate from rate-limit writes.

Suggested fix:

- Cap total keys per user, not only active keys, or prune inactive/deleted keys.
- Add a max expiration duration and validate the computed date.
- Throttle `lastUsedAt` updates, for example only update if older than N minutes, or move usage tracking to an aggregate table/job.

### P2/P3 - Generic utility helpers are easy to misuse

`src/utils/utils.ts:96-105` computes `const random = Math.random()` once, then reuses it for every Fisher-Yates iteration. Each swap should draw a fresh random value.

The biased `shuffle` helper appears unused right now, while `shuffleWithSeed` is used by workshops. A couple of other generic helpers are similarly sharp-edged: `generatePath` at `src/utils/utils.ts:30-40` uses non-null assertions and can substitute `undefined` into routes when a param is missing, and `sample` at `src/utils/utils.ts:114-116` returns an unchecked value for empty arrays.

Suggested fix: compute `Math.random()` inside the loop, or accept an injectable `random` callback like `sample` does. Either delete unused helpers or make them fail explicitly on missing params and empty arrays before they are reused in new code.

### P2 - Docs feedback portals mutate DOM during render and do not clean up fully

`src/components/DocFeedbackProvider.tsx:84-193` scans rendered docs blocks, starts async identifier work, then sets several maps in a `.then()` without a cancellation guard. If the provider unmounts or `children` changes before the promise resolves, stale block maps can be installed after cleanup.

The portal helpers also mutate DOM during render:

- `src/components/DocFeedbackProvider.tsx:396-415`
- `src/components/DocFeedbackProvider.tsx:457-471`
- `src/components/DocFeedbackProvider.tsx:519-533`

They create portal containers under markdown blocks and sometimes set `block.style.position = 'relative'`, but cleanup only clears background, border, padding, and mouse listeners at `src/components/DocFeedbackProvider.tsx:178-191`. Portal nodes and the original `position` value are not restored. The indicator effect at `src/components/DocFeedbackProvider.tsx:196-221` also returns early when there is no user, so styles from a previous authenticated state can remain visible after logout/user switch.

Suggested fix:

- Extract a `useReferenceableBlocks` hook with cancellation and deterministic cleanup.
- Avoid DOM mutation during render; create/remove portal roots in effects.
- Restore every inline style value that the feature changes, or switch to data attributes/CSS classes.
- Consider one overlay root outside the markdown tree instead of per-block containers.

### P2/P3 - Docs feedback server functions need input budgets and SQL aggregation

`src/utils/docFeedback.functions.ts:26-55` accepts feedback content, page paths, library ids, selectors, content hashes, and block markdown with no length caps. The list endpoints accept pagination values with no minimum or maximum at `src/utils/docFeedback.functions.ts:228-242`, `src/utils/docFeedback.functions.ts:311-329`, and `src/utils/docFeedback.functions.ts:448-456`, then use `limit(pageSize)` and `(page - 1) * pageSize` directly.

The public leaderboard is also an all-table read: `src/utils/docFeedback.functions.ts:460-515` selects every approved feedback row, aggregates points in JavaScript, sorts in memory, then slices the requested page. User totals and stats repeat per-user JS aggregation at `src/utils/docFeedback.server.ts:49-68` and `src/utils/docFeedback.server.ts:73-109`.

`markFeedbackDetached` accepts an unbounded id array at `src/utils/docFeedback.functions.ts:622-638`, and moderation date filters convert arbitrary strings to `Date` without rejecting invalid values at `src/utils/docFeedback.functions.ts:364-371`.

Suggested fix: create shared doc-feedback schemas with capped content/path/selector lengths, bounded arrays, and clamped pagination. Move leaderboard/user point aggregation into SQL or a materialized summary table, and reject invalid date filters before they reach Drizzle.

### P2/P3 - Doc feedback edit state can drift from query data

`src/components/DocFeedbackNote.tsx:45-51` initializes editable `content` from `note.content` once, then compares that local state against the latest prop. If the same note id receives fresh query data after a refetch, moderation change, rollback, or cross-tab edit, the textarea can keep showing stale local text and `hasChanges` can be computed against a newer prop value.

The component also manually mirrors the same optimistic cache update shape three times for delete, content update, and collapse state at `src/components/DocFeedbackNote.tsx:89-279`, across both `userFeedback` and `feedback` cache envelopes.

Suggested fix: resync local content when `note.id` or `note.content` changes unless the user has a pending local edit, and extract one small cache-update helper for doc feedback envelopes.

### P3 - Doc feedback block identity utilities are duplicated

`src/utils/docFeedback.ts:11-173` and `src/utils/docFeedback.client.ts:21-250` implement the same selector generation, content hashing, referenceable-block search, selector lookup, and scroll helpers. The live imports use `src/utils/docFeedback.ts` from `src/components/BlockWithFeedback.tsx:6` and `src/components/DocFeedbackProvider.tsx:11-14`; no source import currently points at `src/utils/docFeedback.client.ts`.

The two files already drift in names and surface area: one exports `scrollToElement`, the other exports `scrollToBlock` plus `highlightBlock`. Any future fix to block selector stability, portal exclusion, or hash behavior can easily land in one copy and miss the other.

Suggested fix: delete the unused duplicate or make `docFeedback.client.ts` re-export the canonical implementation. Keep browser-only helpers in one file with explicit tests for generated selectors and detached-block lookup.

### P3 - Moderator notifications are fire-and-forget request work

New docs feedback calls `notifyModerators(...)` without awaiting it at `src/utils/docFeedback.functions.ts:94-110`. Showcase creation does the same at `src/utils/showcase.server.ts:271-287`.

`notifyModerators` ultimately awaits Discord webhook calls through `src/utils/email.server.ts:46-58` and `src/utils/discord.server.ts:30-60`. Those helpers catch errors, so this is not an unhandled-rejection bug, but in Worker-style runtimes a fire-and-forget promise can be dropped once the request finishes unless it is awaited or registered with the runtime execution context.

Suggested fix: either await moderator notifications after the DB/audit write, or introduce a `runAfterResponse`/queue helper that uses the runtime's background task primitive and centralizes notification retry/log policy.

### P2 - Docs sidebar leave timer can fire after unmount

`src/components/LibraryLayout.tsx:1184-1196` stores the large-menu leave timeout in a ref, and `src/components/LibraryLayout.tsx:1238-1247` schedules it on pointer leave. There is no unmount cleanup for the pending timeout.

This is minor, but it can call `setShowLargeMenu(false)` after navigation/unmount and is easy to prevent.

Suggested fix: use `React.useRef<ReturnType<typeof setTimeout> | undefined>()` and add an effect cleanup that clears `leaveTimer.current`.

### P2 - Local storage access is duplicated and not consistently guarded

`src/utils/useLocalStorage.ts:55-63` writes to `localStorage` in an effect without catching quota/privacy-mode failures. `src/components/SearchModal.tsx:249-269` reads/writes the AI dock width directly, and `src/components/SearchModal.tsx:3372-3382` reads/writes the full-height preference directly.

Other code in `SearchModal` already guards Kapa history storage with `try/catch`, so the project has both safe and unsafe local-storage patterns.

`src/routes/_library/$libraryId/$version.docs.framework.$framework.examples.$.tsx:256-317` repeats direct `localStorage` access for the examples view preference. `src/routes/_library/$libraryId/$version.docs.framework.$framework.examples.$.tsx:266-269` also has an inverted guard: it calls `localStorage.setItem` only when `typeof window === 'undefined'`.

More duplicated storage paths:

- `src/components/FrameworkSelect.tsx:50-62` initializes a Zustand store from `localStorage` and writes directly.
- `src/components/FrameworkSelect.tsx:68-71` exposes a separate direct read helper.
- `src/components/VersionSelect.tsx:27-39` repeats the same pattern for docs version.
- `src/hooks/useAdPreference.ts:8-40` reads/writes without catch.
- `src/components/DefaultCatchBoundary.tsx:34-44` reads/writes `sessionStorage` during chunk-error recovery without guarding storage failures.
- `src/components/CopyPageDropdown.tsx:126-131` reads the package-manager preference directly during render.
- `src/components/shop/ProductDrawer.tsx:139-143`, `src/components/shop/ProductDrawer.tsx:223-228`, and `src/components/shop/ProductDrawer.tsx:278` read/write drawer width directly.

`src/components/markdown/usePersistedEnumStore.ts:23-66` is the best local pattern: deferred hydration, enum validation, and `try/catch` for storage failures.

Suggested fix: create a small `safeLocalStorage` helper for `getString`, `setString`, `getJson`, and `setJson`, or generalize `createPersistedEnumStore`, then use it in `useLocalStorage`, framework/version preferences, search preferences, Kapa history, theme/layout preferences, shop drawer width, and game persistence.

### P2/P3 - Docs examples tab state can become a persistent blank view

The examples route accepts `panel` as any string at `src/routes/_library/$libraryId/$version.docs.framework.$framework.examples.$.tsx:63-66`, then reads either the search value or `localStorage.exampleViewPreference` at `src/routes/_library/$libraryId/$version.docs.framework.$framework.examples.$.tsx:256-264`. That value is cast to `CodeExplorer`'s `'code' | 'sandbox'` union at `src/routes/_library/$libraryId/$version.docs.framework.$framework.examples.$.tsx:432-443`.

`CodeExplorer` only renders the code pane when `activeTab === 'code'` and only activates the sandbox when `activeTab === 'sandbox'` at `src/components/CodeExplorer.tsx:80-117`. A URL like `?panel=foo`, or a bad stored value, leaves both panes inactive. The effect at `src/routes/_library/$libraryId/$version.docs.framework.$framework.examples.$.tsx:314-317` then writes that invalid tab value back to local storage, making the blank state sticky.

The same route validates `path` only as `v.string()` at `src/routes/_library/$libraryId/$version.docs.framework.$framework.examples.$.tsx:63-65`; the downstream `fetchFile`/`fetchRepoDirectoryContents` server functions validate repo paths through `repoPathSchema` at `src/utils/docs.functions.ts:66-82`, but the route can reject or normalize earlier with the same helper.

Suggested fix: make `panel` a picklist of `['code', 'sandbox']`, validate persisted tab values before use, clear invalid stored values, and share the existing `isValidRepoPath`/`MAX_REPO_PATH_LENGTH` schema for example `path` search params.

### P2/P3 - Markdown tabs can render no active panel after route or content changes

`src/components/markdown/Tabs.tsx:33-41` initializes uncontrolled `internalActiveSlug` from `params.framework` or the first tab only once. When markdown content changes in the same component position, or the framework route param changes without remounting the tab component, the old slug can stop matching the new `tabsProp`; `src/components/markdown/Tabs.tsx:71-91` then renders every panel as hidden.

`src/components/markdown/FileTabs.tsx:13-17` has the same one-time first-tab initialization. The controlled package-manager path has a related edge: `src/components/markdown/PackageManagerTabs.tsx:83-105` uses the persisted package manager whenever it is a valid global package-manager id, but it does not verify that the current markdown block actually has a panel for that manager. If the stored value is `bun` and a block only includes `npm`/`pnpm`, no panel is active.

Suggested fix: derive `resolvedActiveSlug = tabs.some(...) ? active : tabs[0]?.slug` in the shared `Tabs` primitive, and reset uncontrolled state when the tab list or route framework changes. Apply the same fallback in `FileTabs` and `PackageManagerTabs`.

### P2 - Shared filter search can ignore external resets

`src/components/FilterComponents.tsx:565-571` selects `{ isPending: state.isPending }` from `useDebouncer`, but aliases the whole selected object as `isPending`. The sync effect at `src/components/FilterComponents.tsx:573-585` then treats that object as a boolean, so the "pending" branch is always truthy and local input state can remain authoritative even after the parent clears filters or replaces `value`.

This component is shared across admin and moderation filter bars (`src/components/UsersTopBarFilters.tsx`, `src/components/RolesTopBarFilters.tsx`, `src/components/AuditTopBarFilters.tsx`, `src/components/FeedbackModerationTopBar.tsx`, `src/components/ShowcaseModerationTopBar.tsx`, `src/components/NotesModerationTopBar.tsx`, and `src/components/LoginsTopBarFilters.tsx`), so reset buttons and URL-driven filter state can drift from the visible search box.

Suggested fix: destructure the selected state (`const { state: { isPending }, maybeExecute } = useDebouncer(...)`), or select the boolean directly if the hook supports it. Add a small component test that types a search, clears all filters, and verifies the input value resets.

### P3 - Intent registry search input does not resync from URL changes

`src/routes/intent/registry/index.tsx:67-76` drives queries from route search, but the visible search box is initialized once from `q` at `src/routes/intent/registry/index.tsx:98`. The debounce effect at `src/routes/intent/registry/index.tsx:100-108` only pushes local input into the URL; there is no effect that updates `searchInput` when `q` changes because of back/forward navigation, shared links, tab changes, or loader redirects.

That can leave the page showing results for one URL query while the input displays another value, and the next keystroke can overwrite the URL from stale local state.

Suggested fix: use a shared debounced route-input controller that tracks whether the local edit is pending, syncs local state when the route value changes externally, and cancels pending writes on unmount/navigation. A small regression test should cover typing, navigating back, and verifying the input matches the URL.

### P2/P3 - Clipboard and copied-state helpers are duplicated

There are multiple copy implementations with different failure behavior and timer cleanup:

- `src/components/application-builder/useApplicationBuilder.tsx:415-445` has no clipboard fallback or local error path.
- `src/components/SearchModal.tsx:1227-1248` cleans up its timer but does not handle clipboard rejection.
- `src/components/SearchModal.tsx:1382-1398` repeats a copy flash timer without cleanup even though the nearby chat-copy path does clean up.
- `src/components/SearchModal.tsx:1735-1739` and `src/components/SearchModal.tsx:2090-2092` write message text without catching clipboard failures.
- `src/routes/brand-guide.tsx:88-147` repeats URL/SVG copy logic and fetches SVG text without sharing the stronger fallback helper.
- `src/components/CopyPageDropdown.tsx:143-210` repeats clipboard writes and untracked copied-state timers.
- `src/components/markdown/CodeBlockView.tsx:48-50` writes to clipboard and schedules an untracked copied-state timer.
- `src/routes/account/integrations.tsx:130-135` writes the newly created API key with no clipboard fallback and an untracked copied-state timer.
- `src/routes/intent/registry/$packageName.tsx:311-327` repeats the same untracked copied-state timer for install prompts.
- `src/components/CopyMarkdownButton.tsx:4-29` has a reusable copied-state hook with cleanup.
- `src/components/landing/LandingCopyPromptButton.tsx:71-103` has the strongest clipboard fallback.
- `src/components/BrandContextMenu.tsx:33-55` has user-visible copy failure handling.

Suggested fix: keep one `copyTextToClipboard` helper and one `useCopiedState`/`useCopyButton` helper. Reuse them for docs markdown, brand assets, search/AI, builder, and landing copy buttons.

### P3 - CopyPageDropdown keeps an unbounded client markdown cache

`src/components/CopyPageDropdown.tsx:86-87` defines a module-scope `Map<string, string>`, and `src/components/CopyPageDropdown.tsx:156-183` fetches full markdown responses into it without TTL, max entries, byte limits, or cancellation. In a long-lived SPA session, copying docs or Intent skill pages can retain every fetched markdown body until reload.

The route targeting is intentional: docs pages pass repo/branch/path through `src/components/markdown/MarkdownContent.tsx:120-128`, and Intent skill pages use the current `.md` splat endpoint from `src/routes/intent/registry/$packageName.{$}[.]md.tsx:5-34`. The concern is memory and fetch hygiene, not route correctness.

Suggested fix: use a tiny LRU/TTL cache for copied markdown, add an `AbortController` for repeated clicks/unmount, and share the clipboard/fetch/cached-copy path with the copied-state helper above.

### P3 - Programmatic tab openings bypass the safer link pattern

Anchor links mostly include `rel="noopener noreferrer"` when they use `target="_blank"`, but programmatic opens do not have the same shared wrapper:

- `src/components/CopyPageDropdown.tsx:212-249` opens markdown, Claude, ChatGPT, Cursor, and T3 Chat URLs with `window.open(..., '_blank')` and no feature string.
- `src/components/game/engine/GameEngine.ts:850-856` opens partner, showcase, and library island clicks the same way.
- `src/components/game/ui/BadgeOverlay.tsx:221-230`, `src/components/game/ui/UpgradeOverlay.tsx:181-190`, and `src/components/game/ui/WinOverlay.tsx:151-160` repeat the same pattern for share links.
- `src/auth/client.ts:38-47` opens the OAuth popup without checking whether the popup was blocked.
- `src/components/application-builder/useApplicationBuilder.tsx:855-875` already passes `noopener,noreferrer` for Claude and Cursor opens, which is the stronger local pattern.

Suggested fix: add a small `openExternalWindow`/`openPopupWindow` helper that applies `noopener,noreferrer` for new tabs, has an explicit popup mode for OAuth, returns `null` on blocked popups, and centralizes custom-scheme exceptions.

### P3 - Animated landing demos use inconsistent reduced-motion policy

`src/utils/usePrefersReducedMotion.ts:7-27` is used by `src/components/landing/QueryLanding.tsx:416-501` and `src/components/landing/VirtualLanding.tsx:542-646` to avoid starting automatic animation when users prefer reduced motion.

`src/components/landing/AiLanding.tsx:415-427` still starts rotating client/provider intervals unconditionally, and `src/components/landing/AiLanding.tsx:429-541` runs a looping typewriter/streaming chat sequence through chained timeouts. The home-page framework graph has the same split policy: `src/routes/index.tsx:639-660` disables flow animation for reduced motion, but `src/routes/index.tsx:629-637` keeps rotating the active adapter every 1.15 seconds. The timers clean up on unmount, but the animation policy differs from the other landing demos and keeps doing work for reduced-motion users.

`src/routes/workshops.tsx:433-539` defines an infinite testimonial marquee with inline keyframes and `animate-[testimonials_linear_infinite]`, but has no reduced-motion branch or pause/static alternative. `src/components/LibraryTestimonials.tsx:12-47` repeats that pattern with a per-mount global `<style>` block and an infinite marquee.

`src/components/landing/AiLanding.tsx:429-540` also stores every timeout id in a `timeouts` array but never removes fired ids while the recursive demo keeps looping. A long-lived tab will retain every historical timeout handle until the component unmounts.

Suggested fix: extract a small `useLandingDemoEnabled` or `useReducedMotionGate` helper that returns `false` until the preference is known, disables auto-play when reduced motion is requested, and can later include page visibility checks for nonessential demo animations.

### P3 - Product landing demos hand-roll the product primitives they advertise

Several product landing demos recreate the advertised library behavior with local React state, timers, manual DOM events, or native controls. That keeps the route chunks lighter, but it also creates API drift risk because the demo can keep working even when the product API or recommended pattern changes.

Examples:

- `src/components/landing/FormLanding.tsx:386-398` models fields, validation, dirty state, and submit readiness with local `useState` and inline booleans instead of TanStack Form.
- `src/components/landing/StoreLanding.tsx:339-344` models a store demo with local `useState` instead of TanStack Store.
- `src/components/landing/PacerLanding.tsx:351-373` implements debounce with raw `setTimeout` instead of Pacer.
- `src/components/landing/HotkeysLanding.tsx:302-334` installs a manual `window.addEventListener('keydown')` demo listener while `src/components/landing/HotkeysShortcut.client.tsx:7-11` separately uses `useHotkey` for a hidden page shortcut.
- `src/components/landing/RangerLanding.tsx:261-335` renders native range inputs and custom constraint math, while the visible code sample at `src/components/landing/RangerLanding.tsx:341-350` says `useRanger(...)`.

Suggested fix: choose one policy per page. If the hero panels are intentionally illustrative mocks, isolate them behind a shared `LandingDemoMock` naming/pattern so they are not mistaken for product examples. If they should demonstrate current APIs, lazy-load the actual library-backed demo behind a small shared landing demo harness with reduced-motion and cleanup policy built in.

### P2/P3 - Drag/resize listeners are not consistently owned by effects

`src/components/npm-stats/Resizable.tsx:26-54` attaches document `mousemove`/`mouseup` listeners inside `handleMouseDown`, but the effect cleanup only removes the `mousedown` listener from the drag element. If the component unmounts while dragging, the document listeners are not reachable for cleanup until a later mouseup.

`src/components/SearchModal.tsx:3588-3633` does similar pointer listener setup for the AI dock resize path. It restores `document.body.style.cursor` and `userSelect` in `stopResizing`, but an unmount during an active drag can leave cleanup dependent on a later pointer terminal event.

Other resize/drag paths, such as `src/components/FileExplorer.tsx:154-191` and `src/components/shop/ProductDrawer.tsx:212-235`, keep document listeners inside an effect keyed on dragging state and clean them up on unmount.

Suggested fix: extract `useDragResize` or move npm-stats/search resize tracking to the same `isDragging` effect-owned pattern used elsewhere.

### P2/P3 - Kapa AI submits are not abortable before the network request starts

`src/components/SearchModal.tsx:271-333` waits up to eight seconds for reCAPTCHA through internal timeout/interval state, but the promise is not cancellable. `KapaChatPanel` starts that wait and then calls `submitQuery(trimmed)` at `src/components/SearchModal.tsx:1865-1884`; its cleanup only aborts the active Kapa request later through `apiService.abortCurrent()` at `src/components/SearchModal.tsx:2297-2300`.

If the modal or dock unmounts while waiting for reCAPTCHA, the pending promise can still call the stale `submitQuery` function. That can produce ignored requests, state updates after unmount inside the SDK, or a chat request that starts after the user has closed the surface.

Suggested fix: make `waitForKapaRecaptchaReady` accept an `AbortSignal`, abort pending waits on unmount/new-chat/reset, and check the signal before `submitQuery`.

### P3 - AI dock close semantics do not distinguish hover-open from click-open

`AiDockButton` tracks whether the dock was opened by hovering the button at `src/components/SearchButton.tsx:70-82`, and click handling treats that as a special case at `src/components/SearchButton.tsx:97-108`. Once the panel itself is open, however, `AiDock` schedules a hover close on every non-touch pointer leave at `src/components/SearchModal.tsx:3677-3694`, regardless of whether the panel was opened by hover, click, or an "Ask AI" search result.

That makes a button advertised as an open/close panel behave like a temporary hovercard once the pointer leaves the dock. It is especially easy to hit while reading a longer chat answer or moving to another part of the page.

Suggested fix: model dock open reason explicitly (`hover-preview`, `pinned`, `ask-request`) and only auto-close hover previews. A pinned/click-open dock should stay open until the user clicks the button, closes it, navigates, or an explicit Escape/outside policy runs.

### P3 - FileExplorer expanded folders only initialize once

`src/components/FileExplorer.tsx:105-139` derives `expandedFolders` from `githubContents` and `currentPath` only in the `useState` initializer. If the same `FileExplorer` instance stays mounted while the example path or GitHub tree changes, ancestors for the new current file are not auto-opened.

Suggested fix: move ancestor expansion into an effect keyed by `githubContents` and `currentPath`, or derive the "must be open" ancestor set separately and merge it with user-toggled state.

### P2/P3 - PlotContainer redraws synchronously on every resize

`src/components/charts/PlotContainer.tsx:24-54` removes and recreates the Observable Plot node on every `ResizeObserver` callback. There is no `requestAnimationFrame` coalescing, no try/catch around `options(width)`/`Plot.plot`, and no stale render guard. A resize storm in stats or Intent charts can repeatedly allocate SVG nodes and run chart transforms synchronously.

The wrapper also starts with `ready = false` at `src/components/charts/PlotContainer.tsx:22`, sets it true only after a successful append at `src/components/charts/PlotContainer.tsx:39-42`, and never resets it when width becomes zero or a later render fails. That can leave either a permanent skeleton for initially hidden charts or a blank-but-"ready" chart after a later hidden/failed render.

Callers include `src/components/charts/TimeSeriesChart.tsx:25-54` and `src/components/intent/SkillSparkline.tsx:185-191`.

Suggested fix: wrap Plot rendering in a small `useObservablePlot` hook that batches ResizeObserver updates with `requestAnimationFrame`, records render errors, resets ready/error state on zero-width renders, and always removes the previous plot in effect cleanup.

### P2/P3 - Upload clients rely on server limits after expensive client reads

`src/server/uploadthing.ts:8-56` correctly requires auth and sets server-side image size/count limits. The client wrappers still have some stability gaps:

- `src/components/account/AccountProfilePictureSection.client.tsx:60-69` reads the selected file into a data URL before checking file type or size.
- `src/components/AvatarCropModal.tsx:85-98` starts async image decode/canvas work and then calls `setIsProcessing(false)` in `finally`; closing the modal through `src/components/account/AccountProfilePictureSection.client.tsx:201-210` clears `selectedImage` and unmounts the cropper while that work can still be pending.
- `src/components/account/AccountProfilePictureSection.client.tsx:73-77` and `src/components/ImageUpload.client.tsx:53-68` await `startUpload` without local `try/catch`; if the upload promise rejects outside the callback path, loading state can stick.
- `src/components/ImageUpload.client.tsx:53-68` only checks MIME type client-side and relies on the server for size.
- `src/utils/uploadthing.types.ts:1` exports `UploadRouter = any`, so the generated `useUploadThing`, `UploadButton`, and `UploadDropzone` helpers lose endpoint and file-shape types even though `src/server/uploadthing.ts:57-59` has the real router type.

Suggested fix: add a shared image-upload client helper that checks type and size before preview/crop/upload, handles `FileReader.onerror`, wraps `startUpload` in `try/finally`, and guards async crop completion after unmount/close. Replace `UploadRouter = any` with an erased type-only import from the server router or a generated route type.

### P3 - Image transform options are not clamped

`src/utils/optimizedImage.ts:62-82` passes numeric `width`, `height`, and `quality` directly into Cloudflare image transform params after `Math.round`. `MarkdownImg` can feed markdown-provided dimensions through `src/ui/MarkdownImg.tsx:16-52`, and `OptimizedImage` exposes the same options to all callers at `src/components/OptimizedImage.tsx:15-30`.

Trusted app code mostly passes sane values, but a markdown image with huge, negative, or low-quality dimensions can generate invalid or wasteful transform URLs. Clamp width/height/quality in `createCloudflareTransformOptions`, and reject non-positive values before adding params.

### P3 - Host cache purge lacks response policy

`src/server/runtime/host.server.ts:142-162` posts to Cloudflare cache purge with no timeout and returns the raw fetch response. This should use the same outbound fetch helper recommended elsewhere, with status checking and a bounded timeout.

### P3 - Shared cache helper has a misleading production default TTL

`src/utils/cache.server.ts:3-14` creates a global `LRUCache<string, any>` and sets the default TTL to `1` in production. `lru-cache` TTL values are milliseconds, so the default production TTL is effectively one millisecond. Most `fetchCached` callers pass an explicit TTL, but the helper default is surprising and easy to misuse.

Suggested fix: make TTL required at construction/call sites, or choose a named constant with units in the identifier such as `DEFAULT_DOC_CACHE_TTL_MS`.

### P3 - Database context proxy is fragile outside the request wrapper

`src/db/client.ts:45-76` uses an AsyncLocalStorage-backed lazy proxy, and `src/server.ts:119-163` wraps normal requests in `runWithDatabaseContext`. Scheduled work is wrapped at `src/server.ts:179-182`. That looks safe for normal traffic.

The footgun is `src/db/client.ts:65-67`: if code calls `getDb()` outside the request/scheduled context in an isolate runtime, a fresh client can be created for that property access and is not stored or closed. Keep this proxy, but add a dev assertion or explicit background-task wrapper for any non-request entrypoint.

### P3 - Environment config has two sources of truth

`src/utils/env.ts:3-58` defines typed Valibot schemas and a proxy that hides server-only env values from client code. `src/utils/env.functions.ts:1-28` separately reads `import.meta.env`/`process.env`, hard-codes a GitHub token default, and only includes a subset of server variables.

The split already shows up in mixed usage: `src/utils/stats.functions.ts:6-20`, `src/utils/stats.server.ts:40`, and `src/routes/api/application-starter/resolve.ts:9-16` use `envFunctions`, while auth, MCP, Discord, Shopify, email, crypto, and Sentry use `env`. New env vars can be added to one surface and silently missed by the other.

Suggested fix: make one typed env reader with runtime adapters for app/server-function/worker contexts, and derive any public/client-safe object from that source instead of maintaining `env` and `envFunctions` by hand.

### P3 - Response filenames are hand-built in several routes

`src/routes/api/builder/download.ts:84-88` uses raw `name` inside both `zip.folder(name)` and `Content-Disposition`. The builder finding above covers the higher-risk project-name path.

The docs markdown routes also build inline filenames from route splats:

- `src/routes/_library/$libraryId/$version.docs.{$}[.]md.tsx:51-58`
- `src/routes/_library/$libraryId/$version.docs.framework.$framework.{$}[.]md.tsx:53-60`

Those splats are constrained by docs lookup and path validation downstream, so this is mostly header hygiene. Use one response filename helper that strips/normalizes path separators and quotes per RFC 6266 instead of formatting headers inline.

### P2/P3 - Sentry PII and trace sampling are hard-coded

Browser Sentry is initialized in `src/router.tsx:9-38` with `sendDefaultPii: true` and `tracesSampleRate: 1.0`. Server Sentry is initialized similarly in `src/instrument.server.mjs:3-10`, and the MCP/server helper uses a fallback hard-coded DSN plus `tracesSampleRate: 1.0` at `src/utils/sentry.server.ts:4-16`. There is no environment-specific sample rate, no runtime flag, and no visible masking policy in this app layer.

This may be intentional, but it is a privacy/cost/performance decision that should be explicit and configurable. Full transaction sampling plus default PII can become expensive and can capture more user/request data than expected.

Suggested fix: source Sentry DSN, PII, and trace sample rate from typed environment config, default production tracing to a lower rate, and document the data policy in one observability module.

### P3 - Auth guard methods depend on object `this`

`src/auth/guards.server.ts:18-104` returns an object whose methods call sibling methods through `this` at `src/auth/guards.server.ts:71-83` and `src/auth/guards.server.ts:101-102`. Current usage calls the methods through the guard object, but destructuring `const { requireAdmin } = getAuthGuards()` would break the binding.

Suggested fix: close over local functions instead of using object-method `this`, or return arrow functions that reference local `requireCapability`/`hasCapability` functions directly.

### P3 - Maintenance scripts can materialize large result sets and hang on external APIs

Most scripts are dev-only, but a few are operational enough to deserve production-style guardrails. `scripts/prune-content-cache-negatives.ts:22-25` deletes all negative GitHub content-cache rows and returns every deleted ID just to count them. On a large cache, that turns a cleanup into a large memory result set. Use `.returning()` only when rows are needed; otherwise prefer a counted CTE or chunked deletes with a limit.

The MCP eval scripts have the same missing boundaries as some runtime fetches: `scripts/mcp-eval/run-eval.ts:63-94` initializes and calls MCP with no timeout, response status check, or JSON body validation, then `scripts/mcp-eval/run-eval.ts:111-112` parses tool text as JSON without a schema. `scripts/mcp-eval/run-eval.ts:278-282` divides by `total`, so a filter that matches zero test cases writes `NaN` scores. `scripts/mcp-eval/mine-questions.ts:52-57`, `scripts/mcp-eval/mine-questions.ts:115-127`, and `scripts/mcp-eval/mine-questions.ts:171-173` do external fetches with no timeout/status/body-shape guards.

Suggested fix: share a tiny script fetch helper with timeout/status/json-size guards, fail fast when filters match zero eval cases, and avoid materializing whole delete result sets in bulk cleanup scripts.

### P2/P3 - Production diagnostics can keep Node alive after uncaught exceptions

`src/utils/prod-diagnostics.server.ts:141-198` installs production process probes outside isolate runtimes. The `uncaughtException` listener logs the exception but does not rethrow, exit, or hand off to a shutdown policy. In Node, installing this listener changes the default crash behavior, so the process can continue serving after an exception that may have left state inconsistent.

Suggested fix: for non-isolate deployments, log and then terminate or trigger a controlled shutdown. Keep the current no-op behavior in Workers where `supportsProcessDiagnostics()` is false.

### P3 - TypeScript tests are not wired into `pnpm test`

`package.json:29-33` defines `pnpm test` as `pretest` content generation plus `tsc` and `oxlint`. `tsconfig.json:2-9` explicitly excludes `tests` and `scripts`, and there is no Vitest/Node test script for the assertion files in `tests/*.test.ts`.

The existing tests are useful, especially for repo paths and GitHub content cache behavior, but they can drift without `pnpm test` catching it.

Suggested fix: add a small `test:unit` script that runs the TypeScript assertion files through `tsx` or `node --test` after transpilation, and add a separate `tsconfig.tests.json` if the test files should be typechecked without pulling scripts into the app build.

## Complexity And DRY Targets

### Search and AI dock should be split

`src/components/SearchModal.tsx` is 3,700+ lines and owns several distinct domains:

- Algolia search setup and result rendering (`src/components/SearchModal.tsx:12-20`, `src/components/SearchModal.tsx:215-219`)
- Kapa SDK/chat streaming/history (`src/components/SearchModal.tsx:38-45`, `src/components/SearchModal.tsx:850-1100`)
- modal shell (`src/components/SearchModal.tsx:3367-3504`)
- dock shell (`src/components/SearchModal.tsx:3506+`)
- markdown rendering for chat output
- local storage and resizing behavior

`src/contexts/SearchContext.tsx:3-5` lazy-loads the modal, and `src/components/Navbar.tsx:3-5` lazy-loads `AiDock` from the same module. That means opening the dock pulls the full search/modal/Kapa/Algolia/Streamdown module.

The split should also remove duplicated result-controller logic: `CommandSearchResults` and `SearchResultsInChat` each own `useInfiniteHits`, `IntersectionObserver`, filter clearing, result summaries, `NoResults`, and hit rendering at `src/components/SearchModal.tsx:2451-2565` and `src/components/SearchModal.tsx:2782-2931`. Keep one search-results controller and render it in modal or chat/dock layouts through view props.

Suggested split:

- `search/SearchModalShell.tsx`
- `search/CommandSearchPanel.tsx`
- `search/AlgoliaResults.tsx`
- `ai/AiDock.tsx`
- `ai/KapaChatPanel.tsx`
- `ai/kapaHistory.ts`
- `ai/kapaMarkdown.tsx`

### LibraryLayout should split docs chrome concerns

`src/components/LibraryLayout.tsx` is 1,400+ lines and mixes route params, docs sidebar state, large-menu hover behavior, partner rail, recency, tabs, layout, menu behavior, and link generation. It also has several route/link casts such as `src/components/LibraryLayout.tsx:824`, `src/components/LibraryLayout.tsx:982`, and `src/components/LibraryLayout.tsx:1323`.

Suggested split:

- docs sidebar state and menu timing
- partner/right-rail composition
- docs tab/link helpers
- typed library route-param helpers
- layout shell components

### Product landing pages repeat the same shell contract

The product landing pages are mostly hand-authored, which is fine, but the repeated page contract is now spread across many files. Examples: `src/components/landing/QueryLanding.tsx:20-37`, `src/components/landing/TableLanding.tsx:36-51`, `src/components/landing/VirtualLanding.tsx:26-42`, `src/components/landing/AiLanding.tsx:18-29`, and `src/components/landing/FormLanding.tsx:18-33` all import the same shell-level pieces: docs CTA, downloads, wordmark, sponsor/community/footer sections, landing ad, ecosystem proof, and prompt-copy button.

They also repeat the same docs-link helper with loose route props, for example `src/components/landing/QueryLanding.tsx:776-798`, `src/components/landing/TableLanding.tsx:932-954`, `src/components/landing/VirtualLanding.tsx:1361-1383`, `src/components/landing/AiLanding.tsx:998-1020`, `src/components/landing/FormLanding.tsx:611-633`, `src/components/landing/StoreLanding.tsx:600-622`, `src/components/landing/PacerLanding.tsx:586-608`, `src/components/landing/IntentLanding.tsx:558-600`, `src/components/landing/DevtoolsLanding.tsx:534-556`, `src/components/landing/WorkflowLanding.tsx:518-540`, `src/components/landing/CliLanding.tsx:466-509`, `src/components/landing/ConfigLanding.tsx:481-503`, `src/components/landing/HotkeysLanding.tsx:460-482`, and `src/components/landing/RangerLanding.tsx:430-452`.

The body content should stay local to each product, but the shell contract can be one typed `ProductLandingShell` or smaller shared sections: hero CTAs, download proof, community/sponsor/footer tail, prompt-copy action, ecosystem proof, and docs link helper. That would make new product pages less copy-heavy and keep bundle/lifecycle policy changes, such as reduced-motion handling and prompt-copy behavior, from needing 17 separate edits.

### Library landing route wrappers are generated by hand

Each product landing route under `src/routes/_library/*.$version.index.tsx` is near-identical around route params, version validation, SEO tags, and handing the same metadata shape into a product-specific landing component. Representative copies: `src/routes/_library/ai.$version.index.tsx:12-33`, `src/routes/_library/query.$version.index.tsx:12-33`, `src/routes/_library/start.$version.index.tsx:12-33`, and `src/routes/_library/workflow.$version.index.tsx:12-33`.

File-based routing still needs files, but the local body can shrink to `createLibraryLandingRoute({ libraryId, component })`, or the files can be generated from `src/libraries/ids.ts`. That would centralize the current repeated route metadata contract and remove another place where version validation and route casts can drift.

### Stats modules need smaller ownership boundaries

`src/utils/stats.server.ts` and `src/utils/stats-db.server.ts` each mix public query handling, remote npm/GitHub calls, cache policy, date math, and transformation logic.

The UI side has the same shape. `src/routes/stats/npm/index.tsx:229-620` and `src/routes/_library/$libraryId/$version.docs.npm-stats.tsx:111-401` duplicate route-search state extraction, chart option handlers, package add/remove/color/baseline logic, throttled height updates, loading overlays, and chart/table composition. `src/components/npm-stats/shared.ts:1-6` also imports `packageGroupSchema` from the route-private `src/routes/stats/npm/-comparisons.ts`, which makes shared stats components depend on a page module.

Suggested split:

- npm download request normalization and validation
- npm chunk fetch/cache
- GitHub stats fetch/cache
- org/package aggregate cache
- pure date/range helpers with tests
- npm stats route/search schema, package mutation reducer, and shared chart shell

### Shared modules import route modules for constants and UI primitives

Route modules are serving as shared libraries in several places:

- `src/routes/intent/registry/index.tsx:17` imports `SkillTypeBadge` from sibling route module `src/routes/intent/registry/$packageName.tsx:598-607`.
- `src/components/intent/SkillDependencyGraph.tsx:12` imports `SKILL_TYPE_STYLES` from the same route module and reads it at `src/components/intent/SkillDependencyGraph.tsx:265-278`.
- `src/components/npm-stats/shared.ts:1-6`, `src/utils/npm-packages.ts:1-6`, and `src/mcp/tools/npm-stats.ts:1-3` import npm stats schemas/presets from `src/routes/stats/npm/-comparisons.ts`.
- `src/components/ShowcaseGallery.tsx:19` imports `PAGE_SIZE_OPTIONS` from the showcase route.
- `src/components/ClientAuth.tsx:4` imports `SignInForm` from `src/routes/login.tsx`.

It is easy to create circular route/component dependencies, and it makes bundle analysis harder because importing a small badge, schema, or constant can also import the route module that owns loaders, route context, layout, and page code.

Suggested fix: move shared route-adjacent values into leaf modules: `src/components/intent/skillTypes.tsx`, `src/utils/npm-stats-schema.ts`, `src/utils/showcase-pagination.ts`, and a route-agnostic `SignInForm` component. Routes should import shared primitives, not export them for the rest of the app.

### Sponsor fetching has two near-copies

`src/server/sponsors.ts` and `src/utils/sponsors.functions.ts` are nearly identical. The imported path appears to be `src/utils/sponsors.functions.ts` from `src/components/SponsorPack.tsx`, `src/components/SponsorSection.tsx`, and `src/routes/sponsors-embed.tsx`, while `src/server/sponsors.ts` looks orphaned.

Both copies import D3 scale helpers, fetch GitHub sponsors, cast `extent(...) as [number, number]`, and fall back to mock data with `Math.random()` on auth failure. They have already drifted: `src/server/sponsors.ts:247-253` filters private metadata before merge, while `src/utils/sponsors.functions.ts:254-255` returns the JSON metadata as-is and relies on later filtering. Keep one sponsor data module, remove the duplicate, and make the fallback deterministic or clearly dev-only.

### Maintainer card grids and view-mode controls are copy-pasted

`src/routes/maintainers.tsx:130-161`, `src/routes/paid-support.tsx:59-97`, and `src/routes/_library/$libraryId/$version.docs.contributors.tsx:56-93` define the same compact/full/row segmented control. `src/routes/maintainers.tsx:308-360`, `src/routes/paid-support.tsx:100-128`, and `src/routes/_library/$libraryId/$version.docs.contributors.tsx:95-129` also repeat the same `MaintainerCard` / `CompactMaintainerCard` / `MaintainerRowCard` grid switch and staggered animation wiring.

Suggested fix: extract a small `MaintainerViewModeToggle` and `MaintainerGrid` primitive that receives the current mode, cards, optional stats, and density classes. Then the maintainers route can own filtering/grouping, paid support can own page copy, and card layout changes only happen once.

### P3 - Sponsor pack tooltip placement uses width for vertical math

`src/components/SponsorPack.tsx:89-92` decides `tooltipY` with `circle.y > width / 2` instead of `height / 2`. That will place tooltips on the wrong side in non-square sponsor embeds or sections.

Suggested fix: compare `circle.y` against `height / 2`, and consider extracting a tiny tested `getFloatingTooltipSide({ x, y, width, height })` helper because this same edge math tends to reappear in chart, pack, and canvas overlays.

### Admin surfaces repeat the same filter and table patterns

Repeated top bars and filters exist across users, roles, login history, audit, notes/feedback/showcase moderation, and related admin pages.

Suggested shared pieces:

- `AdminFilterBar`
- `AdminDateRangeFilter`
- `AdminCapabilityFilter`
- `AdminBulkActionBar`
- `AdminPagination`
- `AdminEmptyState`

### Admin mutation wrappers invalidate the whole app cache

`src/utils/mutations.ts:18-131` wraps user and role server functions for admin screens. Every mutation calls `queryClient.invalidateQueries()` with no key at `src/utils/mutations.ts:25-27`, `src/utils/mutations.ts:36-38`, `src/utils/mutations.ts:49-51`, `src/utils/mutations.ts:67-69`, `src/utils/mutations.ts:85-87`, `src/utils/mutations.ts:95-97`, `src/utils/mutations.ts:106-108`, `src/utils/mutations.ts:117-119`, and `src/utils/mutations.ts:128-130`. Several wrappers also cast the payload back into the server-function input shape at `src/utils/mutations.ts:21-24`, `src/utils/mutations.ts:45-48`, `src/utils/mutations.ts:59-66`, and `src/utils/mutations.ts:76-84`.

The wrapper is live in `src/routes/admin/users.tsx:23-309`, `src/routes/admin/roles.index.tsx:15-141`, and `src/routes/admin/roles.$roleId.tsx:3-54`. A role edit can therefore refetch unrelated current-user, docs, shop, stats, or page queries if they are mounted, and the casts hide drift between server-function validators and UI payload types.

Suggested fix: expose query-key factories from `src/queries/users.ts` and `src/queries/roles.ts`, invalidate only affected user/role/capability keys, and infer mutation variables from each server function or from shared schemas instead of recasting local object types.

### Admin dashboard should split tabs and defer tab-specific queries

`src/routes/admin/index.tsx` is 1,300+ lines and contains auth gating, tab navigation, metric cards, activity cards, ads cards, chart controls, chart query wrappers, and chart rendering. `AdminDashboard` starts user stats, activity stats, and DAU stats immediately at `src/routes/admin/index.tsx:116-132`, even though `src/routes/admin/index.tsx:197-222` only renders one tab at a time. The overview tab then mounts additional chart queries at `src/routes/admin/index.tsx:318-325`, and the users/activity tabs repeat similar card and chart structures.

This is admin-only, but it makes the route expensive to open and hard to change without touching unrelated dashboard domains.

Suggested fix: split `AdminOverviewTab`, `AdminUsersSummaryTab`, `AdminActivityTab`, and `AdminAdsTab` into separate files with per-tab query options. Share `MetricCard`, `PercentChangeMetric`, and `AdminChartCard` primitives, and only enable tab-specific queries when that tab is active.

### Account feedback and notes are duplicate list pages

`src/routes/account/feedback.tsx:15-171` and `src/routes/account/notes.tsx:15-118` repeat the same current-user gate, `getUserDocFeedbackQueryOptions`, empty state, page links, `DocFeedbackNote` rendering, and pagination. The only real differences are the feedback `type` filter, copy, stats box, and `itemLabel`.

Extract one `AccountDocFeedbackList` that receives `type`, headings, empty copy, and optional stats/header content. Then the same component can own page-size options, loading state, and any future path validation for stored `pagePath` links.

### UI primitives are duplicated across root and shop

There are duplicate-ish primitives for buttons, badges, select, tooltip, logos, and product-specific skins. Keep product styling, but centralize primitive behavior and accessibility.

Candidates:

- root `Button` and shop button behavior
- `src/components/Tooltip.tsx` vs `src/ui/Tooltip.tsx`
- logo/wordmark variants
- select/popover behavior

### Outside-click/dropdown behavior is fragmented

`src/hooks/useClickOutside.ts:28-120` exists, and `src/components/LibraryLayout.tsx:1188-1205` has started using it, but most source call sites still hand-roll `mousedown`/click/Escape handling instead. Examples include `src/components/FilterComponents.tsx:207-286`, `src/components/DocFeedbackFloatingButton.tsx:40-63`, `src/components/npm-stats/PackageSearch.tsx:37-51`, `src/components/npm-stats/ColorPickerPopover.tsx:18-62`, `src/components/shop/ui/Select.tsx:49-62`, `src/routes/maintainers.tsx:106-115`, and `src/routes/partners.index.tsx:134-143`.

The hook itself has a small dependency trap: `additionalRefs = []` creates a new array on each render, so an enabled caller that does not pass refs would re-install listeners each render. Move the empty array to module scope or split the dependency to stable values, then migrate bespoke outside-click code to the hook or to Radix primitives.

### Shared validation schemas are too thin

`src/utils/schemas.ts` currently centralizes enum/picklist schemas, but most route/server-function validators still define their own pagination, dates, bounded strings, arrays, URLs, package names, cache keys, and ids inline. This is why the same missing max-value/max-length pattern repeats across showcase, feedback, users, roles, audit, stats, shop, Intent, OAuth, and builder endpoints.

Suggested shared schema helpers:

- `boundedPaginationSchema({ defaultPageSize, maxPageSize })`
- `boundedSearchSchema({ maxLength })`
- `boundedUuidArraySchema({ maxItems })`
- `dateRangeSchema({ maxDays, allowAllTime })`
- `httpUrlSchema({ maxLength, allowedProtocols })`
- `npmPackageNameSchema`
- `repoRefPathSchema`
- `projectNameSchema`

### Partner data should split serializable metadata from UI assets

`src/utils/partners.tsx` is 1,700+ lines and mixes partner data, image imports, JSX content, LLM descriptions, app-starter helpers, placement metadata, and UI-ish helpers. It is imported by routes, builder features, game code, application-starter code, LLM/data endpoints, partner pages, and docs layout.

The public data endpoint at `src/routes/api/data/partners.ts:1-43` imports the same heavy module used by UI surfaces. This makes data-only callers pay for asset/JSX shape and makes partner metadata harder to reuse safely.

Suggested split:

- `partners.data.ts`: serializable ids, names, URLs, descriptions, placement metadata
- `partners.assets.tsx`: logo/image imports and `PartnerImage`
- `partners.content.tsx`: JSX marketing copy
- `partners.application-starter.ts`: app-starter-specific helpers
- data endpoints and LLM helpers should import only serializable metadata

### Shop product option UI duplicates color semantics

`src/components/shop/ProductDrawer.tsx:15-94` defines `COLOR_HEX`, `contrastColor`, `isDarkColor`, and `resolveColorHex`. `src/components/shop/ProductCard.tsx:10-77` carries a second `COLOR_MAP`/`colorHex` implementation with a comment saying it is kept in sync with the drawer.

`src/components/shop/ui/Chip.tsx:75-90` adds a third color path for `colorBg`/`selectedBg`, assumes full 6-digit hex input, and returns `rgba(NaN, NaN, NaN, alpha)` or an arbitrary contrast result for malformed values. Current shop color callers mostly use the drawer/card maps, but the primitive invites future raw Shopify option colors without validation.

That is a small duplication today, but this is exactly the kind of UI data drift that causes “same color name, different swatch” bugs as merch variants grow.

Suggested fix: move color token resolution and contrast helpers into a tiny `shop/colors` helper used by product cards, product drawers, and future product-option UI.

### Showcase voting should share one optimistic mutation controller

The showcase vote flow is duplicated across:

- `src/components/ShowcaseGallery.tsx:65-181`
- `src/components/ShowcaseSection.tsx:103-184`
- `src/components/ShowcaseDetail.tsx:82-163`

Each copy builds a votes map, toggles local vote state, computes score deltas, snapshots cache state, rolls back on error, and invalidates `['showcases']`. The detail variant has different cache shapes, but the mutation semantics are the same.

Suggested fix: extract `useShowcaseVoteMutation({ voteIds, targets })` or a small cache updater that owns `applyVoteToggle`, `getScoreDelta`, rollback context, and invalidation policy. That would pair well with fixing the server-side vote race and make list/detail/related cards harder to drift.

### Showcase shared helpers have dead duplicate copies

`src/utils/showcase.shared.ts:3-44` defines the client/server-safe helpers used by showcase forms, filters, details, and admin screens. The same `expandLibraryDependencies`, `getAutoIncludedLibraries`, `isValidUrl`, and `USE_CASE_LABELS` implementations still exist in `src/utils/showcase.client.ts:6-59`, which is not imported anywhere under `src`, and the dependency/URL helpers are repeated again in `src/utils/showcase.server.ts:89-128`.

Suggested fix: delete `showcase.client.ts` and have server code import the shared helpers where the logic is truly isomorphic. Keep server-only validation wrappers in `showcase.server.ts`, but remove duplicate primitive implementations.

### Docs feedback should become a DOM lifecycle primitive

`DocFeedbackProvider` contains block discovery, hash/selector generation, hover state, inline style mutation, note placement, feedback creation state, and portal management in one component.

Suggested split:

- pure block discovery and selector/hash helpers
- `useReferenceableBlocks`
- `useBlockHover`
- `DocsFeedbackOverlay`
- server-function/data hooks for notes and improvements

That would also make the feature easier to test without rendering full docs pages.

### Builder deploy UI should share one controller

`src/components/builder/DeployDialog.tsx` and `src/components/ExampleDeployDialog.tsx` are parallel flows with the same auth gating, repo-name input, debounced availability check, public/private visibility toggle, countdown, provider redirect, and success/error surfaces. The deployment action payload is the main difference.

Create one `DeployDialogShell` plus a `useDeployDialogController` hook that accepts a typed `deploy()` function. That would reduce duplicated lifecycle bugs and make it easier to harden GitHub deploy behavior once.

### Browser effect helpers would remove repeated footguns

Timer cleanup, popup polling, clipboard writes, localStorage reads, and one-off DOM mutation appear in several components. The project already has a good timer-cleanup example in `src/components/ApplicationStarter.tsx:227-240` and `src/components/ApplicationStarter.tsx:428-434`; extract that pattern into small hooks/helpers instead of reimplementing it ad hoc.

## Bundle And Dead-Code Targets

### Search AI bundle

Search is lazy, but `SearchModal.tsx` bundles Algolia, Kapa, Streamdown, modal UI, and dock UI together. Splitting the dock from the full modal should reduce the first AI-dock interaction cost.

### Partner imports pull UI assets into data-only callers

`src/utils/partners.tsx` imports dozens of logo/image assets and exports JSX-bearing partner objects. Because data endpoints, LLM helpers, builder/game code, and UI routes import the same module, a data-only caller can still drag UI asset metadata and JSX into its graph.

Split serializable partner metadata from image/JSX modules before doing bundle analysis; otherwise the analyzer will show a broad partner module but not the cleaner data boundary that should exist.

### Builder feature loading pulls the full partner module

`src/components/builder/store.ts:374-382` dynamically imports `~/builder/api/features`, but `src/builder/api/features.ts:4` imports `partners` from `~/utils/partners` just to derive active partner add-on ids at `src/builder/api/features.ts:6-9`.

That makes the builder feature-load path depend on the large JSX/image-bearing partner module. Move active partner ids into serializable partner metadata or a tiny `partners.application-starter` module.

### Start/Router landing prompt buttons import starter resolver logic

`src/components/landing/StartLanding.tsx:25-28` and `src/components/landing/RouterLanding.tsx:25-28` import `resolveApplicationStarterDeterministically` directly. The work only runs when `LandingCopyPromptButton` is clicked (`src/components/landing/StartLanding.tsx:646-657`, `src/components/landing/RouterLanding.tsx:645-656`), but the import still puts the application-starter resolver and partner helpers on those landing chunks.

Lazy-load the resolver inside the prompt getter or precompute the static blank prompt so the landing routes do not import partner/application-starter inference code up front.

### Plot/d3 on Intent surfaces

`src/components/landing/IntentLanding.tsx:21` imports `SkillSparkline` directly, and `src/components/intent/SkillSparkline.tsx:1-3` imports Observable Plot. This puts Plot on the public Intent landing. The same landing preview also imports Intent React Query wrappers at `src/components/landing/IntentLanding.tsx:28-32` and fires stats, directory, and skill-history queries as soon as the preview mounts at `src/components/landing/IntentLanding.tsx:342-357`; those wrappers call server functions through `src/queries/intent.ts:15-33` and `src/queries/intent.ts:71-77`. Most registry pages already lazy-load sparklines elsewhere.

`src/routes/intent/registry/$packageName.index.tsx:16` imports `SkillDependencyGraph`, and that imports d3 force modules at `src/components/intent/SkillDependencyGraph.tsx:2-10`. Lazy-load it only when a package has graph edges.

### NPM stats lazy chart still imports d3 in the route chunk

`src/routes/stats/npm/index.tsx:26` and `src/routes/_library/$libraryId/$version.docs.npm-stats.tsx:21` eagerly import `npmQueryOptions`, and `src/components/npm-stats/npmQueryOptions.ts:1-23` imports all of d3 just for UTC day math. `NPMStatsChart` is lazy-loaded at `src/routes/stats/npm/index.tsx:38-42` and `src/routes/_library/$libraryId/$version.docs.npm-stats.tsx:44-48`, but d3 still lands in the route's initial stats chunk before the chart loads.

`src/utils/chart.ts:1-43` also mixes Valibot schemas/constants with `import * as d3 from 'd3'`. That means consumers that only need shared chart metadata still cross the d3 boundary: `src/routes/stats/npm/-utils.ts:3-9` re-exports `binTypeSchema`, `BinType`, `binningOptions`, and `getBinFunction`, while `src/utils/activity.server.ts:4` imports only `ALL_TIME_FLOOR_DATE` from the same module.

Suggested fix: replace the query-option date math with a tiny native UTC date helper, or lazy-load the full stats visualization/query module after the user has packages to chart. Split `utils/chart` into schema/date constants and d3-backed binning/rollup helpers so server/admin/simple route utilities do not import d3 by accident.

### Shop promo/3D components appear unused

`src/components/shop/ShopHero3D.tsx` imports Three/React Three/drei, but no other source file imports `ShopHero3D`. It currently appears dead. The same source-graph scan shows `src/components/shop/ShopDropCard.tsx` and `src/components/shop/ShopStrip.tsx` are also unimported.

If the 3D hero is reintroduced, it needs type cleanup too: `src/components/shop/ShopHero3D.tsx:254-276` casts GLTF nodes and refs to `any`, then assumes `nodes.T_Shirt_male.geometry` exists at `src/components/shop/ShopHero3D.tsx:369-409`. Remove dead shop promo components, or wire them deliberately behind a route-level lazy boundary with typed GLTF loading.

### Account feedback has an unused duplicate component

`src/components/UserFeedbackSection.tsx:11-218` appears unimported under `src`. It also accepts a `userId` prop but ignores it at `src/components/UserFeedbackSection.tsx:15-23`, always querying the current user's feedback.

The live account feedback and notes routes use `src/routes/account/feedback.tsx` and `src/routes/account/notes.tsx` directly, with overlapping card/list behavior. Delete the unused component, or collapse the live account feedback/notes pages and any future profile-specific feedback surface behind one explicit component whose props match its query contract.

### Inline logo SVGs have dead copies and fixed ids

`src/ui/LogoQueryGG.tsx:1-456` is the exported version used by `src/routes/learn.tsx:4` and rendered at `src/routes/learn.tsx:118`. The older copies `src/components/LogoQueryGG.tsx:1-221` and `src/components/LogoQueryGGSmall.tsx:1-228` are not imported anywhere under `src`.

The TanStack logo copies have the same source-graph problem: `src/components/LogoColor.tsx:1-623` and `src/components/Logo.tsx:1-387` are not imported anywhere under `src`. Both wrap huge inline SVGs in `BrandContextMenu` and carry fixed ids such as `linearGradient-1`, `mask-3`, `path-2`, `path-22`, `path-1`, and `mask-4`.

That leaves 1,459 lines of inline SVG application code that route reachability will never use. The live `src/ui/LogoQueryGG.tsx:12-19` and `src/ui/LogoQueryGG.tsx:241-248` variants also use fixed clip-path ids, and `src/components/game/ui/Minimap.tsx:131-137` repeats the same pattern with `id="diamond-clip"`, so rendering multiple copies of the same SVG component in one document can still create id-collision surprises.

Suggested fix: delete the dead component copies or replace all variants with one static SVG asset plus a small typed wrapper. This is a good candidate for a reachability-aware inline-SVG duplicate check.

### Game has an unused React Three Fiber scene stack

`src/routes/explore.tsx:5-57` lazy-loads `src/components/game/IslandExplorer.client.tsx`, and that component imports `VanillaGameScene` at `src/components/game/IslandExplorer.client.tsx:6` and renders it at `src/components/game/IslandExplorer.client.tsx:69-72`. The older `GameScene` export at `src/components/game/scene/GameScene.tsx:267-287` is not imported anywhere under `src`.

That leaves a full React Three Fiber scene implementation under `src/components/game/scene/*`, plus R3F-specific hooks like `src/components/game/hooks/useBoatControls.ts` and `src/components/game/hooks/useAIOpponents.ts`, as application code that no route currently exercises. `package.json:47-48` still carries `@react-three/drei` and `@react-three/fiber`; the current vanilla engine uses `three` directly.

Suggested fix: either delete the old R3F scene tree and remove the unused dependencies, or move it behind an explicit experimental route/lazy entry with a clear owner. Until then it doubles the game maintenance surface and can confuse future fixes because two implementations model the same world.

### Navbar merch menu imports shop server-function code globally

`src/components/Navbar.tsx:61-63` imports `getProducts`, Shopify formatting helpers, and `ProductListItem` for a merch mega-menu that only loads products after pointer/focus activation at `src/components/Navbar.tsx:1122-1190`. Because the import lives in the global navbar module, the shop server-function wrapper and Shopify query module are part of the navbar's module graph on every page even though most sessions never open the merch menu.

Suggested fix: split `MerchMenuContent` and `MerchProductLink` into a lazy child module, or expose a tiny `getNavbarMerchProducts` query wrapper from a shop-only module and lazy import it when the menu activates.

### P3 - Mobile merch menu can show an empty recent-products section

`MerchMenuContent` only flips `shouldLoad` from `pointerenter`/`focusin` listeners attached at `src/components/Navbar.tsx:1122-1150`. The product request is gated on `shouldLoad` at `src/components/Navbar.tsx:1152-1190`, and the skeletons are also gated on `shouldLoad` at `src/components/Navbar.tsx:1214-1245`.

On mobile, opening the Merch collapsible renders the content but does not necessarily fire pointerenter or focusin on the content root. The result is a `Recent Products` heading with no skeletons and no products, followed by only the `All Merch` link.

Suggested fix: when `variant === 'mobile'`, load as soon as the menu content mounts or pass the collapsible open state into `MerchMenuContent`. If the merch module is split lazily, make mobile open the same lazy boundary immediately.

### Existing positive bundle work

`vite.config.ts` already has manual chunks for TanStack Start/router/query/react/icons, route component code-splitting, and an `ANALYZE` bundle-analyzer path. Build on that rather than starting over.

## Reusable Patterns Worth Harvesting

### Good pattern: application-starter route guard

`src/routes/api/application-starter/resolve.ts` is the best local model for guarded public JSON endpoints:

- rate limits
- content-length check
- content-type check
- origin/referer/sec-fetch-site checks
- runtime schema parsing
- `Cache-Control: no-store`

Turn this into a reusable helper for API routes and server functions.

### Good pattern: Start import protection and CSRF defaults

`src/start.ts:7-15` enables CSRF middleware for server functions before Sentry middleware. `vite.config.ts:289-319` also uses TanStack Start import protection to block server-only files and server-only packages from client imports.

Keep this as the baseline while hardening route handlers: server functions already get a better default than raw route handlers, so the reusable API-boundary helper should close that gap rather than duplicating middleware behavior.

### Good pattern: application-starter lazy UI and stale async guards

`src/components/ApplicationStarter.tsx:67-77` lazy-loads hotkeys and deploy dialogs, so those behaviors are not in the base starter UI chunk. The same component owns transient feedback timers and clears them on unmount at `src/components/ApplicationStarter.tsx:227-240` and `src/components/ApplicationStarter.tsx:428-434`.

`src/components/application-builder/useApplicationBuilder.tsx:466-480` and `src/components/application-builder/useApplicationBuilder.tsx:493-517` use request ids to ignore stale async resolution. Keep that request-id pattern for prompt/deploy/remote-load flows that can be superseded by newer user input.

### Good pattern: GitHub/docs cache key validation

`src/utils/github-content-cache.server.ts` has strong cache-key validation, bounded path/ref/repo shapes, stale fallback, negative cache handling, and tests in `tests/github-content-cache.test.ts`.

This is a strong candidate for a reusable TanStack docs-site cache helper or at least a project-level pattern.

### Good pattern: repo path validation

`src/utils/repo-path.ts` has focused tests in `tests/repo-path.test.ts`. Reuse this style for other user-influenced identifiers: package names, project names, cache artifact keys, remote template IDs.

### Good pattern: persisted enum store

`src/components/markdown/usePersistedEnumStore.ts:23-66` avoids SSR/CSR mismatches by hydrating from storage in an effect, validates stored enum values, and catches storage access failures. Generalize this for framework/version/theme/search/shop preferences instead of keeping several direct `localStorage` implementations.

### Good pattern: runtime parsing for persisted chat history

`src/components/SearchModal.tsx:879-999` parses Kapa chat history from `localStorage` through small runtime readers, rejects malformed items, bounds the stored list to five entries, and falls back cleanly on JSON/storage failures. This pattern should be extracted before more persisted UI state accumulates.

### Good pattern: slim data modules with explicit heavy-data escape hatches

`src/libraries/libraries.ts:1-2` keeps base library data lightweight, while `src/libraries/index.tsx:34-44` explicitly avoids re-exporting extended per-library landing-page projects that contain React nodes and heavier assets. `publicLibraries` and `isPublicLibrary` now give navigation/search/API callers one shared public catalog boundary. This is the right shape for global navigation/docs data: a slim default import path plus opt-in heavy modules for routes that actually render the full experience.

### Good pattern: lazy activation for expensive navbar features

`src/components/Navbar.tsx:3-10` lazy-loads search/AI and auth controls, and `src/components/Navbar.tsx:405-424` only activates the AI dock mount after user intent. Keep this pattern when splitting SearchModal/AiDock: route chrome should not import chat/search providers until needed.

### Good pattern: npm download chunk cache shape

`src/utils/npm-download-cache.server.ts` has a useful chunk-cache abstraction with typed object checks, encoded keys, and Blob storage separation. It needs list-operation caps, but the date-range normalization and storage boundary are worth harvesting into a reusable stats helper.

### Good pattern: visibility-aware animated counters

`src/hooks/useNpmDownloadCounter.ts:55-132` and `src/components/LibraryDownloadsMicro.tsx:145-205` update animated numbers with `requestAnimationFrame`, pause on hidden tabs, and clean up frame/focus/pageshow listeners. This is a good pattern for any live-but-noncritical visual counter.

### Potential upstream/library work

- A TanStack Start API-boundary helper for route handlers and `createServerFn`.
- A Cloudflare-safe outbound fetch helper.
- A docs markdown trust-boundary renderer pair: trusted docs renderer and untrusted safe renderer.
- An npm download chunk cache helper with tested date-range normalization.
- Builder definition schema shared between client UI, validate, compile, download, deploy, and MCP.
- A deploy-dialog controller shared by builder-generated projects and docs example deployment.
- React/browser effect helpers for timed flags, popup polling, clipboard writes, guarded storage, outside-click behavior, and drag-resize listeners.
- Static data contract tests for public catalogs, maintainer/social URLs, package metadata IDs, and other small hand-authored data tables.
- An OAuth PKCE helper with atomic code consumption patterns for Drizzle/Postgres.
- A first-party OAuth callback helper that validates provider params, clears transient cookies on every exit, and normalizes provider token/profile responses.
- A React Query query-options linter/helper that asserts query keys include every query-function input.
- A reduced-motion gate for marketing/demo animations.
- A typed polymorphic button/select primitive that defaults non-submit buttons safely.
- A GitHub repository deploy helper with file-manifest validation, deadlines, rollback/continuation semantics, and typed partial-success states.
- A prompt-control metadata pattern for AI helpers that keeps control fields out of user-provided text.
- A transaction-boundary helper for admin/auth mutations that pairs domain writes, audit writes, and unique-conflict retry behavior.
- An npm-stats UI controller/schema helper that owns URL search state, package mutations, chart height clamps, and route-specific defaults.
- A global-shell lazy-panel pattern for rare navbar/menu/drawer panels that should not import server-function wrappers or heavy product modules up front.
- A typed image transform helper that clamps Cloudflare image params and keeps markdown-provided dimensions inside a documented range.
- A Shopify image transform helper with URL host checks, dimension clamps, and a shared responsive `srcset` builder.
- A route-owned font asset contract that declares exact font families once per route scope and prevents duplicate CSS `@import`/`<link>` loads.
- A card-with-secondary-actions interaction helper that keeps card-level navigation/quick-view/toggle behavior, nested links/swatches, keyboard activation, and image-hover preloading within valid accessibility and network budgets.
- A packed-logo/tooltip layout helper for sponsor and partner visualizations.
- A library/framework color-token helper that exposes complete class variants instead of modifying Tailwind class strings at call sites.
- A showcase voting controller that centralizes optimistic vote toggles, score deltas, rollback context, and query invalidation.
- A Sentry/observability config helper with typed sample-rate/PII flags and runtime-specific defaults.
- A typed environment adapter that works across TanStack Start app code, server functions, workers, and local scripts without maintaining duplicate env objects.
- A docs manifest builder with file-count budgets, redirect metadata caching, and stale-fallback behavior.
- An auth activity recorder/middleware pattern that keeps auth reads separate from engagement/streak writes.
- A bounded background refresh runner for scheduled/admin stats jobs with retry deadlines, partial-result reporting, and external API backoff policy.
- A local script runtime helper for bounded fetches, zero-row assertions, and large-table maintenance deletes.
- A route-module boundary helper/lint rule that prevents reusable components from importing route files for constants, badges, or schemas.
- A route search UI-state schema helper that pairs URL search picklists with persisted preference validation and invalid-value recovery.
- An admin bulk-selection controller that ties selected ids to a query fingerprint, exposes visible/hidden selection counts, and clears stale selections on filter/page changes.
- A keyed admin row-action controller for refresh/retry/delete workflows that scopes pending/error state to specific ids instead of a whole table.
- A safe ratio/percentage formatting helper for dashboard cards, charts, and progress bars.
- A route-scoped cursor pagination controller that fingerprints query inputs, rejects stale load-more responses, owns accumulated page state, and exposes reset/load-more primitives.
- A same-origin/internal-route classifier for source links, markdown links, search hits, and AI citations that uses URL parsing and protocol policy instead of substring/prefix checks.
- An interaction-triggered lazy-data helper that can express hover/focus intent on desktop and immediate open/mount intent on mobile.
- An application-starter partner-selection controller that returns selected, muted/conflicting, visible, and prompt-ready partner ids from one typed state model.
- A starter-recipe normalization helper shared by CLI command generation, advanced builder URLs, download URLs, deploy dialogs, and builder-store hydration.
- A typed stats-cache mapper that preserves field semantics consistently across fetch, merge, admin display, and historical delta calculation.
- A route reachability/dependency-pruning pass that starts from route entries, marks truly reachable client/server modules, and flags legacy UI stacks whose package dependencies can be removed.
- A fail-fast static-content lookup helper for required library/product/category data, so marketing pages do not hide taxonomy drift behind generic fallbacks.
- A package-metadata/static-profile URL normalizer for npm/github/package-manager/maintainer data that converts common repository forms and bare domains to safe public web URLs and drops non-web protocols before rendering anchors.
- A transactional version-ingestion writer that pairs content inserts, skill metadata replacement, status updates, and retry/dead-letter state for package registry jobs.
- A docs-redirect table matcher that compiles legacy redirects into segment-aware matchers with explicit search/hash preservation and route-only classification.
- A public-library catalog selector that consistently applies visibility, route availability, sitemap, nav, API, and LLM-index rules from one source.
- A shared search-results controller that owns infinite hits, dedupe, result summaries, filter clearing, and observer cleanup while exposing modal/dock-specific render slots.
- A pinned-vs-hover panel state machine for global docks, chat panels, and hover previews so open reason, dirty state, auto-close behavior, and keyboard dismissal stay explicit.
- A reachability-aware SVG asset helper or lint pass that detects duplicate inline SVG components, fixed id collisions, and unreferenced icon/logo copies before they become permanent application code.
- A product-landing shell contract that centralizes docs CTAs, download proof, ecosystem proof, prompt-copy controls, sponsor/community/footer tail, and shared demo lifecycle policy while leaving product-specific sections local.
- A typed product docs link helper that preserves TanStack Router route/param typing instead of repeating `to: string` plus `params: Record<string, string>` wrappers per landing page.
- A landing demo policy/helper that distinguishes illustrative mocks from real product-backed demos and carries reduced-motion, page-visibility, timer cleanup, and client-only loading rules.
- A small route-page registry preview helper for public product pages that can render cached/static summaries by default and lazy-load live React Query/Plot previews only on interaction or viewport intent.
- A repeated-form-control id helper/lint that derives stable ids for table rows, field arrays, modals, and expanded panels so labels never point at duplicate DOM ids.
- A bidirectional endpoint contract helper that exports request and response schemas together, then gives clients a typed `fetchJson(schema)` wrapper instead of per-call casts.
- A safe external-window opener helper that centralizes `noopener,noreferrer`, blocked-popup handling, and anchor-vs-scripted-open policy.
- A resilient frontmatter reader that returns typed parse results, quarantines malformed docs metadata, and lets manifests skip bad files without failing a whole route.
- A partial-cache completeness contract for chunked caches so callers can distinguish full hits, partial hits, stale fallback, and required origin refresh.
- A tarball path normalizer for npm/package ingestion that stores safe path segments and renders source links through URL builders instead of string concatenation.
- A state-machine completion test helper that covers `0/1`, `1/1`, and `N/N` final-transition cases where guards and assignments can run in the wrong order.
- A builder worker-manifest adapter exported upstream from `@tanstack/create`, so app code does not need to mirror generated manifest type gaps, category/exclusive switch statements, and explicit add-on loader maps like `src/builder/api/create-worker.ts:15-601`.
- A URL/store hydration helper for long-lived route UIs, covering typed search parsing, browser back/forward, async option loading, and explicit loop prevention.
- A repeated card-grid/view-mode controller for public directory pages that keeps segmented controls, responsive grid classes, row/full/compact cards, and staggered animation policy in one place.
- A current-user query-key/auth-cache helper that scopes private React Query data by user/session and clears affected namespaces on auth transitions.
- A library landing route factory or generator that keeps file-route wrappers tiny while centralizing version validation, SEO metadata, and product component handoff.
- A package-name slug codec for npm-style route params, with tests for scoped packages, underscores, encoded slashes, invalid percent escapes, and canonical redirect behavior.

## Potential AI Skills To Harvest

- `tanstack-start-api-hardening`: audit/fix route handlers and server functions for schema validation, rate limits, request-size guards, CSRF/same-origin policy, cache headers, and sanitized errors.
- `cloudflare-outbound-fetch-hygiene`: add timeouts, byte limits, status handling, content-type checks, and header allowlists to Worker/server fetch calls.
- `builder-contract-audit`: keep builder UI, compile, validate, download, deploy, and MCP flows on one schema and one project-definition contract.
- `docs-cache-key-hardening`: validate repo/ref/path/artifact cache keys, negative-cache behavior, stale fallback, and prune behavior.
- `npm-stats-cache-and-fanout`: cap public stats queries, normalize date chunks, cache npm download ranges, and control concurrency.
- `markdown-trust-boundary-review`: classify markdown sources and apply trusted/raw vs sanitized/no-HTML rendering policies.
- `admin-crud-pattern-extractor`: find repeated admin tables/filter bars/bulk actions and extract shared primitives.
- `react-module-lifecycle-audit`: find module-scope browser side effects, unpaired listeners, intervals, localStorage parsing, and SSR leaks.
- `bundle-hotspot-splitter`: locate direct imports of heavy dependencies and suggest route/lazy/manual-chunk boundaries.
- `tanstack-type-safety-sweep`: remove `as any`, replace string casts with picklists, and move validation to source schemas.
- `intent-registry-ingestion-hardening`: separate public reads from package ingestion, validate npm package names, bound tarball extraction, and add retry/backoff policy.
- `ephemeral-auth-flow-audit`: review short-lived ticket/device-code/popup auth flows for durable storage, replay/consume semantics, rate limits, and cleanup lifecycle.
- `route-param-boundary-sweep`: audit route loaders, server functions, and route handlers for uncapped search params, raw JSON reads, unsafe splats, and missing body guards.
- `cms-html-trust-boundary`: classify CMS-sourced HTML, add sanitizer/allowlist policy, and document which external content can reach `dangerouslySetInnerHTML`.
- `react-dom-overlay-lifecycle`: audit portals and DOM overlays for render-time mutation, stale async setup, style restoration, unmount cleanup, and SSR/HMR behavior.
- `browser-storage-hardening`: replace direct `localStorage`/`sessionStorage` calls with guarded helpers, runtime validation, TTL semantics, and quota/private-mode fallbacks.
- `deploy-dialog-flow-extractor`: find duplicated deploy/auth/repo-name/provider-redirect flows and extract one typed controller with cancellation and shared validation.
- `browser-effect-helper-harvest`: turn repeated timers, popup polling, clipboard writes, and transient flags into cleanup-safe React hooks.
- `dropdown-behavior-consolidator`: migrate bespoke outside-click/Escape dropdown handling to one stable hook or Radix primitive pattern.
- `drag-resize-lifecycle-audit`: find document-level drag listeners and convert them to effect-owned cleanup-safe resize hooks.
- `stats-query-boundary-hardening`: add package/date/window caps, Blob-list budgets, and concurrency limits to public and admin stats paths.
- `partner-data-bundle-splitter`: separate serializable partner metadata from logo assets, JSX content, app-starter helpers, and LLM exports.
- `tanstack-router-param-cast-removal`: replace route/link `as never` and enum casts with typed params, search schemas, and shared route helpers.
- `shared-cache-ttl-audit`: find cache helpers with ambiguous time units, default TTLs, unbounded maps, and missing eviction policy.
- `builder-custom-feature-contract-audit`: verify custom templates/add-ons are either disabled in UI or carried through validate, compile, download, deploy, attribution, and MCP.
- `landing-chunk-data-boundary-audit`: find landing routes that import deterministic generators, charting, partner data, or other heavy helpers only needed after a click.
- `stale-async-request-guard-harvest`: identify async UI flows that need request ids, abort signals, or unmount guards, then extract the local good pattern.
- `optimistic-mutation-contract-audit`: review React Query optimistic updates for typed optimistic shapes, rollback coverage, concurrent-mutation coordination, and QueryClient-scoped state.
- `content-publication-boundary-audit`: verify drafts, future posts, private CMS entries, and preview routes are not publicly readable unless an authenticated preview mode allows it.
- `oauth-callback-hardening`: audit OAuth start/callback routes for provider picklists, return-to normalization, transient-cookie cleanup, typed provider response parsing, and atomic session revocation.
- `user-media-url-contract-audit`: verify image/file upload UI contracts match server-side URL acceptance, host allowlists, size/type checks, and public rendering surfaces.
- `react-query-key-completeness-audit`: compare query keys against query-function inputs and find cache collisions caused by omitted params, arrays, filters, or limits.
- `ui-primitive-form-default-audit`: review shared button/select/menu primitives for native form defaults, ref typing, polymorphic casts, and accessible trigger behavior.
- `reduced-motion-demo-audit`: find autoplaying demo animations, timers, intervals, and typewriter effects that should respect reduced motion and page visibility.
- `test-command-coverage-audit`: compare `package.json` scripts, tsconfigs, and test files to ensure the default test command actually typechecks and runs the intended suites.
- `github-repo-deploy-hardening`: audit create-repo-and-push flows for file budgets, path normalization, deadlines, retry policy, orphaned partial deployments, and UX recovery.
- `ai-prompt-control-channel-audit`: find hidden control markers embedded in user prompt strings and move them into validated schema fields before prompt rendering.
- `product-quota-contract-audit`: verify rate-limit constants, UI quota copy, status endpoints, and enforcement behavior all express the same product limit.
- `admin-transaction-boundary-audit`: find multi-step admin/auth mutations that need one transaction, audit-log coupling, conflict retry, and typed partial-failure states.
- `global-shell-bundle-boundary-audit`: find global chrome imports that pull rare menu/drawer/product modules or server-function wrappers into every page.
- `npm-stats-ui-state-extractor`: consolidate npm stats URL search schemas, package mutation reducers, chart shell composition, and bounded visualization controls.
- `observability-pii-sampling-audit`: review Sentry/logging setup for default PII, trace sample rates, error masking, request identifiers, and production cost controls.
- `cloudflare-image-transform-contract-audit`: clamp and validate image transform width, height, quality, fit, and format values across markdown and component callers.
- `route-derived-state-sync-audit`: find React state initialized from route params/loader data/props that should resync on navigation without wiping user intent.
- `typed-env-surface-consolidator`: find duplicated env readers, fallback defaults, client/server leakage risks, and missing schema entries across app, server-function, worker, and script runtimes.
- `docs-manifest-fanout-budget-audit`: cap docs manifest generation by file count, fetch concurrency, redirect-path inputs, recursive tree completeness, and cold-cache deadline.
- `auth-side-effect-separation-audit`: identify auth/session helpers that perform analytics, activity, audit, or mutation side effects and move them to explicit middleware or route-owned calls.
- `scheduled-job-deadline-audit`: find cron/admin refresh loops with unbounded retries, no abort signals, or no partial-failure result model.
- `oauth-token-encryption-migration-audit`: detect plaintext legacy token compatibility paths, add read-repair/backfill plans, and define a fail-closed migration endpoint.
- `blob-cache-batch-budget-audit`: add request-size, object-list, cursor-page, and Promise concurrency budgets to Blob/R2-backed cache helpers.
- `shopify-storefront-boundary-audit`: cap Storefront API page sizes, cursors, handles, discount codes, quantities, trusted HTML, image transforms, and cart optimistic update contracts.
- `shop-product-option-dry-audit`: extract duplicated swatch/color/variant-selection semantics across product cards, product pages, and drawers.
- `visualization-overlay-geometry-audit`: verify chart, pack, canvas, and map overlays use the right dimensions, clamp to viewport bounds, and share tested tooltip-side math.
- `tailwind-token-contract-audit`: find class-string tokens that are composed with opacity, variants, or dark-mode fragments and replace them with structured variants or CSS variables.
- `showcase-vote-controller-extractor`: consolidate duplicated optimistic vote mutations into one typed controller with shared rollback and cache invalidation semantics.
- `script-runtime-boundary-audit`: audit local maintenance/eval scripts for unbounded fetches, unchecked JSON, zero-result math, and bulk database operations that materialize huge result sets.
- `route-module-boundary-audit`: find components, utils, and shared modules importing route files for constants, schemas, or small UI primitives, then move them into leaf shared modules.
- `route-search-ui-state-contract-audit`: find URL search params and persisted preferences that feed UI unions through casts, then replace them with picklists, safe storage validation, and fallback recovery.
- `admin-bulk-selection-state-audit`: find bulk-selection state that survives route query, filter, page, or data changes, then add query fingerprints, visible/hidden counts, and stale-selection recovery.
- `dashboard-ratio-safety-audit`: find UI ratios and progress bars that divide by untrusted or possibly-zero denominators, then centralize safe percentage formatting and empty-state rendering.
- `cursor-pagination-stale-response-audit`: find local accumulated-page state fed by route/search params, then add request fingerprints, abort signals, and late-response rejection.
- `internal-link-classifier-audit`: find source/markdown/search links that decide internal routing through substring checks, then replace them with URL parsing, origin allowlists, and static/API route exclusions.
- `interaction-triggered-lazy-data-audit`: find UI data loads gated on hover/focus/intent, then verify keyboard, touch, mobile-open, and already-mounted states all trigger the load or render an intentional empty state.
- `selection-visibility-contract-audit`: find helpers whose names/signatures imply filtering, visibility, or conflict handling but whose callers implement those rules elsewhere, then collapse them into one typed selection-state model or remove the dead abstraction.
- `starter-recipe-output-contract-audit`: compare a generated starter recipe across CLI command, builder URL, download URL, deploy dialog, and hydrated builder state to find fields that are serialized in one path but dropped or renamed in another.
- `stats-cache-field-preservation-audit`: compare typed stats objects against cache merge/write paths, admin tables, and delta calculations to find fields that are silently dropped, reset, or reinterpreted.
- `route-reachability-dead-stack-audit`: walk route/client entry imports to find unreferenced feature stacks, then connect each dead stack to package dependencies, tests, docs, and cleanup risk.
- `static-content-invariant-audit`: find required product/category/content lookups that return first-item or empty fallbacks, then replace them with typed required lookups, build-time assertions, or explicit empty states.
- `debounced-route-input-sync-audit`: find inputs that initialize from URL search and debounce writes back, then verify external route changes, browser back/forward, pending edits, and unmount cancellation keep visible state and URL state aligned.
- `external-package-metadata-url-audit`: find npm/package metadata URLs rendered into anchors, image tags, markdown, or deploy links, then normalize protocols, repository shorthands, labels, and host allowlists before display.
- `registry-ingestion-transaction-audit`: find package/version ingestion paths that delete and reinsert derived rows, then wrap replacement plus status updates in transactions with retry-safe previous data behavior.
- `static-profile-url-validation-audit`: find maintainer/team/customer/sponsor data rendered into external anchors or images, then validate protocols, bare domains, host labels, and broken-profile fallbacks at build time.
- `legacy-redirect-segment-audit`: find route redirect tables that use string prefix or `includes` checks, then replace them with URL-parsed, segment-aware matchers and tests for near-prefix paths and query-string false positives.
- `public-catalog-visibility-audit`: compare source visibility flags against navigation, sitemap, API, LLM, partner, and category catalog outputs, then replace one-off exclusions with shared public/private selectors.
- `markdown-link-protocol-audit`: find markdown/content link renderers that route or rewrite links by prefix, then add protocol-aware classification for same-origin routes, static assets, hashes, mailto/tel/custom schemes, and unsafe protocols.
- `url-store-hydration-audit`: find React routes that hydrate Zustand/local component state from URL search params only on mount, then harden them for back/forward navigation, typed parsing, async option loading, and loop prevention.
- `library-landing-route-wrapper-audit`: find generated-by-hand file-route wrappers that differ only by product id/component and extract a route factory or generator.
- `package-slug-codec-audit`: audit package-name route codecs for scoped npm names, slash encoding, underscore collisions, canonical redirects, and unsafe decode failures.
- `search-results-controller-extractor`: find duplicated search result panes that each own hits, infinite-scroll observers, filter chips, empty states, and summaries, then extract one controller with surface-specific rendering.
- `global-panel-open-state-audit`: find hover/click/dirty global panels whose open state is a boolean, then replace them with explicit open reasons, pinned state, delayed-close ownership, and keyboard/touch semantics.
- `inline-svg-duplicate-audit`: find unreferenced or near-duplicate inline SVG logo/icon components, fixed `id`/`clipPath` collisions, and candidates for static assets or one typed wrapper.
- `product-landing-shell-extractor`: find repeated product landing imports, hero CTA shapes, download proof, prompt-copy controls, sponsor/community/footer tails, and demo lifecycle rules, then extract only the stable page shell contract.
- `product-card-interaction-audit`: find listing cards that combine card-level click/keyboard handlers with nested buttons, links, swatches, or eager hover-media preloads, then split interactions and add preload budgets.
- `repeated-form-control-id-audit`: find repeated table rows, field arrays, dialogs, or expanded panels that render fixed `id`/`htmlFor` pairs, then derive stable row-local ids.
- `client-response-schema-audit`: find client fetch helpers that cast JSON to application types while the server only validates requests, then add shared response schemas and typed error envelopes.
- `frontmatter-parse-resilience-audit`: find docs/content loaders where one malformed frontmatter block can break manifests, pages, or global indexes, then add typed parse results and skip/report behavior.
- `partial-cache-hit-contract-audit`: find chunked cache readers that return partial data as if it were complete, then split full-hit, partial-hit, stale-hit, and miss semantics.
- `programmatic-window-open-helper-audit`: find `window.open` callsites and normalize `noopener,noreferrer`, blocked-popup handling, fallback anchors, and user-gesture expectations.
- `tarball-path-normalization-audit`: find package tarball paths stored or rendered as source URLs, then normalize path segments and block traversal/encoding edge cases.
- `state-machine-final-transition-audit`: find XState/state-machine guards that test completion before assignment actions, then add final-item regression tests for each phase.
- `landing-demo-dogfooding-audit`: compare product landing demos against the actual product APIs they describe, then classify each demo as intentional mock, static illustration, or API-backed example with lazy-loading and cleanup policy.
- `route-link-helper-type-audit`: find local `Link` wrappers that accept `to: string`, loose params, or secondary-link route strings, then replace them with typed route helpers or one typed CTA primitive.
- `public-preview-bundle-query-audit`: find marketing pages that mount registry/stats/chart previews on initial render, then decide which should be static, viewport-gated, or lazy-loaded behind interaction.
- `game-engine-lifecycle-and-vector-audit`: review Three.js game code for shared geometry ownership, async loader cancellation, timer cleanup, zero-distance vector math, and duplicate active/dead scene stacks.
- `directory-view-mode-component-audit`: find public directory pages that copy segmented view controls, card grid switches, and animation wrappers, then extract a typed reusable controller without coupling route filters together.
- `auth-scoped-query-cache-audit`: find current-user/private React Query keys that omit user/session fingerprints, then add scoped keys and auth transition cache clearing.
- `analytics-cardinality-privacy-audit`: find analytics props that carry raw UUIDs, random seeds, user-entered strings, URLs, or other high-cardinality identifiers, then replace them with bounded cohorts, versions, and explicit debug-only channels.
- `admin-capability-contract-audit`: compare admin nav items, route `beforeLoad` guards, client guard components, and server-function capability checks so partial moderators never see or trigger admin-only surfaces.
- `capability-boundary-validation-audit`: find server functions, loaders, and client helpers that cast capability strings instead of validating against the shared capability registry.
- `doc-feedback-scale-contract-audit`: cap feedback content/selectors/pagination, move leaderboard aggregation out of all-table JS reads, and extract one cache-update helper for feedback envelopes.
- `worker-background-task-audit`: find fire-and-forget promises inside request handlers, then convert them to awaited work, queues, or runtime background-task primitives.
- `accessible-table-disclosure-audit`: find clickable table headers/rows that rely on pointer interaction and replace them with native buttons, `aria-sort`, and disclosure semantics.
- `admin-keyed-row-action-audit`: find table/list actions whose mutation state disables every row, then replace them with keyed pending/error state and per-row double-click guards.
- `route-font-asset-audit`: compare route `<link>` font loads, CSS `@import`s, and Tailwind font tokens to remove duplicate families, unused families, and mismatched mono/display tokens.

## Suggested Next Passes

1. Triage the P0/P1/P2 findings into small fix PRs, starting with auth/OAuth, analytics proxy headers, builder endpoint guards, stats fan-out caps, and Shopify/search validation.
2. Run `ANALYZE=1 pnpm build` only when ready to pay the build cost, then compare actual chunks against the bundle findings above.
3. Add focused tests for the high-risk fixes before changing auth/token, builder, stats, Intent ingestion, markdown, and Shopify behavior.
4. Add a reachability/dead-code pass to the regular workflow so unused SVG, R3F, shop promo, and global CSS utility code does not grow back.

## Tests

No tests were run for this report. This pass made no application code changes.
