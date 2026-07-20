# Partner Placement

Partner placement is split into three separate decisions:

- **Eligibility:** whether a partner can appear for a surface, category, library, feature, or user context.
- **Tier:** the partner's commercial/display tier, which controls visual treatment and relative access to surfaces.
- **Order:** the sequence used inside a surface once eligible partners are known.

The order policy should be explicit per surface. Avoid treating the partner array order or legacy score as the policy itself.

## Order Strategies

### `static-curated`

Use for surfaces where the order is editorially or commercially curated and should remain stable. These surfaces can preserve the existing order, use partner seniority, or use private commercial priority when seniority is unavailable.

Do not expose private commercial criteria in client-facing field names, comments, or API responses. If a private priority is required, keep the public/client value generic, such as `placementPriority` or an already-resolved ordered list.

### `tier-rotated`

Use for visible partner surfaces where partners in the same tier should cycle over time. Tier order remains fixed, but partners inside the same tier are selected with weighted-random ordering for each loaded app session and surface.

The root loader creates the session seed, so SSR and hydration receive the same value through loader data. Client placement hooks read the root loader data directly and do not refresh it during normal navigation. Each surface combines its stable surface id with the session seed; avoid runtime-generated component ids in the seed because they can diverge across server and client rendering. Partners default to equal probability within their tier; a future `placementWeight` can bias same-tier odds without changing the ordering API.

### `contextual-recommendation`

Use when a surface behaves like a product recommendation or builder suggestion. Product fit should be established before commercial weighting affects order. This strategy currently preserves the legacy tier/priority behavior while giving recommendation surfaces a separate policy label.

### `machine-readable`

Use for AI- or crawler-facing outputs such as `llms.txt` and JSON feeds. These should be deterministic and relevance-first. Do not rotate them merely for logo fairness unless the downstream behavior has been designed and disclosed as such.

## Reserved Rules

Reserved rules should be narrow. For example, Cloudflare is reserved as the first deployment/hosting partner in any list that contains Cloudflare and other deployment partners. That should not imply Cloudflare is globally first across every partner surface; non-deployment partners can still appear before Cloudflare when the surface is mixed-category.

Deployment action buttons are a deployment-only surface. Cloudflare remains first when present. Tier order is still preserved, and providers within the same tier can rotate by session.

## Current Surfaces

- Partner directory: `tier-rotated` for active partners, `static-curated` for previous partners.
- Partner grids and embeds: `tier-rotated`.
- Docs and blog rails: `tier-rotated`.
- Mobile docs strip: `tier-rotated`.
- Builder feature picker and starter partner suggestions: `contextual-recommendation`.
- Deploy action buttons: `tier-rotated` with deployment provider tiers preserved.
- `llms.txt` and `/api/data/partners`: `machine-readable`.

## Analytics

Partner impression and click events should include:

- `partner_id`
- `placement`
- `slot_index`
- `partner_tier`
- `order_strategy`
- `rotation_seed` when the strategy rotates

This lets reporting distinguish partner performance from placement policy and makes under/over-exposure easier to debug.

## Contract Language

Suggested external framing:

> Partner tiers determine eligibility, visual treatment, reporting, and relative access to surfaces. Placement within the same tier may rotate or be curated depending on the surface. Some placements may include explicitly reserved rules for product, infrastructure, legal, or strategic reasons.

For AI-assisted selection:

> AI-assisted partner selection prioritizes user need and capability fit first. Partner tier may influence selection only among qualified options.
