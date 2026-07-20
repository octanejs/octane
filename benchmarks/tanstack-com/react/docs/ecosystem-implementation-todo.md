# Ecosystem Implementation Todo

## Goal

Build a database-driven `/ecosystem` marketplace and submission flow without blocking the partner-page SEO work.

## Product Goals

- Create an `/ecosystem` directory page that acts like a marketplace
- Let users sort and filter entries by the fields that actually matter
- Let companies submit new listings through a first-party submission flow
- Seed the marketplace with existing TanStack partners when the DB work starts
- Let TanStack maintainers add an official review and comparisons to each listing
- Keep partner-backed entries aligned with `/partners/[partner]` pages

## Scope To Build Later

### Data model

- Add a new `ecosystemEntries` table
- Add a dedicated moderation capability like `moderate-ecosystem`
- Keep the schema intentionally small and high-value

Suggested v1 fields:

- `id`
- `userId`
- `slug`
- `name`
- `websiteUrl`
- `kind`
- `tags`
- `libraries`
- `pricingModel`
- `isOpenSource`
- `preferenceScore`
- `isPartner`
- `logoUrl`
- `screenshotUrl`
- `summary`
- `officialReviewMd`
- `competitorSlugs`
- `status`
- `moderationNote`
- `moderatedBy`
- `moderatedAt`
- `createdAt`
- `updatedAt`

### Taxonomy

Use a very small taxonomy surface:

- `kind`: `integration | service | tool | template | plugin`
- `pricingModel`: `free | freemium | paid | contact | oss`
- `tags: string[]` absorbs both "type" and "service"

### Comparison model

Use slugs everywhere.

- Partners compare against other partner ids, which are also their slugs
- Ecosystem entries compare against ecosystem slugs
- Partner-backed ecosystem entries should reuse the same slug namespace

Suggested v1 field:

- `competitorSlugs: string[]`

No UUID-based comparison references for v1.
No partner-only comparison system.
No extra comparison tables unless the simple shape breaks down.

### Canonical URL rules

- Partner-backed entries should be canonical at `/partners/[partner]`
- Non-partner entries should be canonical at `/ecosystem/[slug]`
- If a partner-backed entry is reachable from `/ecosystem/[slug]`, redirect or canonicalize to `/partners/[partner]`

### Submission flow

Build a user-facing submission portal similar in spirit to showcase, but for ecosystem listings.

Suggested v1 required fields:

- `name`
- `websiteUrl`
- `kind`
- `tags`
- `libraries`
- `pricingModel`
- `isOpenSource`
- `logoUrl`
- `screenshotUrl`
- `summary`

Maintainer-only fields for v1:

- `preferenceScore`
- `officialReviewMd`
- `competitorSlugs`
- moderation fields

### Admin flow

- Add `/admin/ecosystem`
- Add `/admin/ecosystem/[id]`
- Let maintainers moderate submissions
- Let maintainers edit all listing fields
- Let maintainers set `preferenceScore`
- Let maintainers author `officialReviewMd`
- Let maintainers manage `competitorSlugs`

### Account flow

- Add `/account/ecosystem`
- Let users view, edit, and delete their own submissions
- Keep this separate from `/account/integrations`, which already means something else

## Seeding Plan

- Seed existing partners into the ecosystem table when the DB work starts
- Preserve current partner ids as ecosystem slugs for partner-backed entries
- Seed `preferenceScore` from the existing `partners[].score` values
- Start seeded partner entries as `approved`
- Keep the current score scale and revisit later if needed

## Suggested Implementation Order

1. Add ecosystem capability, enums, and DB schema
2. Add ecosystem server functions and query options
3. Seed partner rows into the new table
4. Build `/ecosystem` index and `/ecosystem/[slug]`
5. Build `/ecosystem/submit` and edit flows
6. Build `/account/ecosystem`
7. Build `/admin/ecosystem`
8. Add SEO metadata and JSON-LD
9. Run `pnpm test`

## Notes

- Reuse showcase architecture patterns, not the showcase schema
- Keep the implementation intentionally small at first
- Avoid over-modeling comparison data until real usage demands it
- Partner pages ship first; ecosystem follows later
