# Analytics

Reference for the TanStack.com event taxonomy in Google Analytics 4.

**GA4 property:** `G-JMT1Z50SPS`
**First-party proxy:** all hits route through `/_a/g/collect` on tanstack.com (see `netlify.toml`)
**Implementation:** [src/utils/analytics.ts](../src/utils/analytics.ts), [src/utils/analytics/events.ts](../src/utils/analytics/events.ts)

## Design principles

1. **Event names describe what happened.** Properties carry context. Adding a new partner placement is an enum value, not a new event.
2. **One event per outcome, not per intent.** No `_clicked`/`_attempted` events when an outcome event is going to fire anyway.
3. **No per-row events.** Counts and joined-string arrays as properties, not N rows per generation.
4. **Session context propagates.** Slow-changing props like `mode_used` and `idea_used` are stamped on every builder event so any breakdown works without joins.
5. **Typed registry.** Wrong props for an event = TypeScript error, not silent bad data.

---

## The funnel

Application Builder, four steps. No `OR` conditions, no overlapping event names.

| #   | Step                  | Event               | Filter                            |
| --- | --------------------- | ------------------- | --------------------------------- |
| 1   | Landed on builder     | `page_view`         | `page_type = application_builder` |
| 2   | Got an analysis       | `builder_analyzed`  | —                                 |
| 3   | Got a generation      | `builder_generated` | —                                 |
| 4   | Took action on result | `builder_activated` | —                                 |

Drop-off between any two steps is unambiguous.

**Failure rates** are separate explorations, not branches off the funnel:

- Analysis failure rate = `builder_failed[stage=analysis]` ÷ (`builder_analyzed` + `builder_failed[stage=analysis]`)
- Generation failure rate = `builder_failed[stage=generation]` ÷ (`builder_generated` + `builder_failed[stage=generation]`)
- Login wall rate = `builder_failed[stage=login_blocked]` ÷ `page_view[page_type=application_builder]`

---

## Event reference (9 events)

Every event automatically receives `page_location`, `page_path`, `page_title`, `page_type` from the analytics utility.

### `page_view`

Fires on initial load (auto from gtag config) and on every SPA navigation.

| Prop            | Type   | Notes                                                                                                                          |
| --------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------ |
| `page_location` | string | Full URL                                                                                                                       |
| `page_path`     | string | Pathname                                                                                                                       |
| `page_title`    | string | `document.title`                                                                                                               |
| `page_type`     | enum   | `home`, `partners_index`, `partner_detail`, `blog_index`, `blog_post`, `docs`, `partners_embed`, `application_builder`, `page` |

---

### `partner_viewed`

A partner UI element scrolled ≥50% into the viewport. Fires once per element-mount per session (the underlying `IntersectionObserver` disconnects after first fire).

| Prop         | Type    | Notes                                               |
| ------------ | ------- | --------------------------------------------------- |
| `partner_id` | string  | Stable partner identifier                           |
| `placement`  | enum    | See `PartnerPlacement` below                        |
| `slot_index` | number? | Position in the surface (0-indexed) when applicable |

**Note on inflation:** when filters change on the partners directory, cards unmount/remount and `partner_viewed` re-fires. Treat session-unique impressions as the dedup'd metric (compute in BigQuery with `FIRST_VALUE(... PARTITION BY session_id, partner_id)`).

---

### `partner_clicked`

User clicked a partner UI element to navigate somewhere.

| Prop               | Type    | Notes                                                                      |
| ------------------ | ------- | -------------------------------------------------------------------------- |
| `partner_id`       | string  |                                                                            |
| `placement`        | enum    | See `PartnerPlacement` below                                               |
| `destination`      | enum    | `external` (partner's site) or `internal_detail` (our partner detail page) |
| `destination_host` | string? | Host of the destination URL when `external`                                |
| `slot_index`       | number? | Position in the surface when applicable                                    |

CTR per placement = `partner_clicked` ÷ `partner_viewed` filtered to same `placement`.

---

### `partner_filter_applied`

User changed the filter state on the partners directory.

| Prop              | Type           | Notes                                                                                         |
| ----------------- | -------------- | --------------------------------------------------------------------------------------------- |
| `change`          | enum           | `libraries_changed`, `status_changed`, `cleared_all`                                          |
| `library_filters` | string         | Comma-joined library ids in the filter, or empty string                                       |
| `status_filter`   | string \| null | `null` means "no status filter applied" — distinguishes from "user explicitly chose 'active'" |
| `result_count`    | number         | Number of partners visible after the filter                                                   |

---

### `partner_inquiry_started`

User clicked a "get in touch", "let's chat", or "become a partner" CTA.

| Prop        | Type | Notes                                                      |
| ----------- | ---- | ---------------------------------------------------------- |
| `placement` | enum | `partners_index_cta`, `library_callout`, `docs_right_rail` |

---

### `builder_analyzed`

Analysis API call succeeded. Outcome event — always preceded by user intent, no separate `_requested` event.

| Prop                     | Type    | Notes                                         |
| ------------------------ | ------- | --------------------------------------------- |
| `mode_used`              | enum    | Session context: `lucky`, `confident`, `none` |
| `idea_used`              | string  | Session context: idea label, or `none`        |
| `analysis_deployment`    | string? | Inferred deploy target                        |
| `inferred_library_count` | number  |                                               |
| `inferred_partner_count` | number  |                                               |
| `feature_count`          | number  |                                               |

---

### `builder_generated`

Generation API call succeeded.

| Prop                    | Type    | Notes                                                                  |
| ----------------------- | ------- | ---------------------------------------------------------------------- |
| `mode_used`             | enum    | Session context                                                        |
| `idea_used`             | string  | Session context                                                        |
| `final_deployment`      | string? | The chosen deploy target on the final result                           |
| `final_package_manager` | string  | `pnpm`, `npm`, `yarn`, `bun`                                           |
| `final_library_count`   | number  |                                                                        |
| `final_partner_count`   | number  |                                                                        |
| `final_addon_count`     | number  |                                                                        |
| `library_ids`           | string  | Comma-joined LibraryIds — use `SPLIT()` in BigQuery for top-N analysis |
| `partner_ids`           | string  | Comma-joined                                                           |
| `addon_ids`             | string  | Comma-joined                                                           |

---

### `builder_failed`

Single umbrella event for analysis failures, generation failures, and login-wall blocks. Use the `stage` prop to distinguish.

| Prop                              | Type    | Notes                                                                                        |
| --------------------------------- | ------- | -------------------------------------------------------------------------------------------- |
| `mode_used`                       | enum    | Session context                                                                              |
| `idea_used`                       | string  | Session context                                                                              |
| `stage`                           | enum    | `analysis`, `generation`, `login_blocked`                                                    |
| `error_message`                   | string? | Free-form error message — high cardinality, don't register as a dimension; query in BigQuery |
| `retry_after`                     | number? | Seconds until retry permitted (login_blocked only)                                           |
| `anonymous_generations_remaining` | number? | When the failure was rate-limit related                                                      |

---

### `builder_activated`

User took an action on the generated result. Single event with `action` prop covers all post-generation actions.

| Prop        | Type    | Notes                                                                                                                        |
| ----------- | ------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `mode_used` | enum    | Session context                                                                                                              |
| `idea_used` | string  | Session context                                                                                                              |
| `action`    | enum    | See `BuilderAction` below                                                                                                    |
| `surface`   | enum    | `result_panel` (main builder UI) or `deploy_dialog`                                                                          |
| `provider`  | string? | Deploy provider when applicable: `vercel`, `netlify`, `cloudflare`                                                           |
| `automatic` | boolean | `true` for system-driven actions (e.g., deploy_dialog auto-redirect countdown). Filter to `false` for true user click rates. |

**Important:** automatic prompt-copies that fire as a side-effect of generation do NOT emit `builder_activated`. Only user-driven actions count as activation.

---

## Enums

### `PartnerPlacement`

| Value                | Where it appears                                                                                                                  |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `directory`          | Partner cards in `/partners` index                                                                                                |
| `detail`             | Partner detail page CTA                                                                                                           |
| `docs_rail`          | Right rail on docs pages — partner cards AND the "Become a Partner" link both fire with this placement (event name distinguishes) |
| `blog_rail`          | Right rail on blog pages                                                                                                          |
| `grid`               | Generic partners grid (fallback)                                                                                                  |
| `home_grid`          | Home page social-proof grid                                                                                                       |
| `library_grid`       | Library page partners section — filter `page_path` to know which library                                                          |
| `embed_grid`         | Partners embed view                                                                                                               |
| `docs_strip`         | Mobile partner strip in docs                                                                                                      |
| `ecosystem_game`     | 3D ecosystem game islands                                                                                                         |
| `partners_index_cta` | "Get in touch" mailto on `/partners`                                                                                              |
| `library_callout`    | "Let's chat" callout per library                                                                                                  |

### `BuilderAction`

| Value                      | Means                                                                  |
| -------------------------- | ---------------------------------------------------------------------- |
| `copy_prompt`              | User clicked a copy button on the prompt                               |
| `deploy`                   | Started a deploy through the deploy dialog                             |
| `clone_repo`               | Cloned the GitHub repo                                                 |
| `open_codex`               | Opened the result in Codex                                             |
| `open_claude`              | Opened the result in Claude                                            |
| `open_cursor`              | Opened the result in Cursor                                            |
| `download`                 | Downloaded the project as a zip                                        |
| `open_advanced`            | Opened the advanced builder editor                                     |
| `netlify_start`            | Started a Netlify deploy from the result                               |
| `provider_redirect_manual` | User clicked through to deploy provider                                |
| `provider_redirect_auto`   | Countdown auto-redirected user to deploy provider (`automatic = true`) |
| `open_repo`                | Opened the project repo from the deploy dialog                         |

---

## Session context

`mode_used` and `idea_used` are tracked in the builder hook and stamped on **every** builder event. This means any builder event can be sliced by mode or idea without session joins.

**`mode_used`** transitions:

- `none` → `lucky` when user clicks "I'm feeling lucky"
- `none` → `confident` when user clicks "I'm feeling confident"

**`idea_used`** transitions:

- `none` → idea label string when user picks a suggested idea
- Reset back to `none` if user clears or types fresh input (TBD — currently sticks for the session)

---

## Custom dimensions to register in GA4

Admin → Custom definitions → Create custom dimension. **Event scope** for all of these. Without registration, they're stored in BigQuery export but invisible in the GA4 UI.

| Dimension name        | API name                | Used on                                                  |
| --------------------- | ----------------------- | -------------------------------------------------------- |
| Placement             | `placement`             | partner_viewed, partner_clicked, partner_inquiry_started |
| Partner ID            | `partner_id`            | partner_viewed, partner_clicked                          |
| Mode used             | `mode_used`             | all builder events                                       |
| Idea used             | `idea_used`             | all builder events                                       |
| Action                | `action`                | builder_activated                                        |
| Surface               | `surface`               | builder_activated                                        |
| Stage                 | `stage`                 | builder_failed                                           |
| Final deployment      | `final_deployment`      | builder_generated                                        |
| Final package manager | `final_package_manager` | builder_generated                                        |
| Final library count   | `final_library_count`   | builder_generated                                        |
| Final partner count   | `final_partner_count`   | builder_generated                                        |
| Page type             | `page_type`             | all events                                               |

12 dimensions. Well under the 50-dimension event-scoped limit.

**Don't register:** `error_message`, `library_ids`, `partner_ids`, `addon_ids`, `destination_host`. High cardinality. Query in BigQuery.

---

## Common GA4 queries

### "What's our funnel completion rate?"

**Explore → Funnel exploration**, four steps as defined above. Open funnel. Show elapsed time.

### "Lucky vs Confident: which mode converts better?"

Same funnel, breakdown dropdown = `mode_used`. Compare side by side.

### "Which deploy targets do successful generations land on?"

**Explore → Free-form**, dimension = `final_deployment`, metric = event count of `builder_generated`.

### "What % of users hit the login wall?"

Free-form, filter `event_name = builder_failed`, breakdown by `stage`.

### "Which placement converts best for partner discovery?"

Free-form, filter `event_name = partner_clicked OR partner_viewed`, breakdown by `placement`. Compute CTR yourself: clicks ÷ views per placement.

### "Top 10 libraries in completed generations"

Requires BigQuery — `library_ids` is high-cardinality. Sample query:

```sql
SELECT
  library_id,
  COUNT(*) AS generations
FROM `tanstack.analytics_*.events_*`,
UNNEST(SPLIT((SELECT value.string_value
              FROM UNNEST(event_params)
              WHERE key = 'library_ids'), ',')) AS library_id
WHERE event_name = 'builder_generated'
  AND _TABLE_SUFFIX BETWEEN '20260101' AND '20260131'
GROUP BY library_id
ORDER BY generations DESC
LIMIT 10
```

---

## BigQuery export

**Strongly recommended.** Free at our event volume. Without it, anything beyond stock reports is painful.

Setup:

1. GA4 Admin → BigQuery Links → Link
2. Pick a GCP project, daily export, US multi-region
3. Tables appear at `tanstack.analytics_<property_id>.events_YYYYMMDD` after ~24h

Once enabled, all event properties are queryable — including the ones not registered as custom dimensions. Use SQL for everything dimensional or aggregate-heavy. Use the GA4 UI for funnel exploration and headline numbers.

---

## Adding new events

Anything additive should not require schema migration of the existing taxonomy.

**Add a new partner placement:**

1. Add the value to `PartnerPlacement` in [src/utils/analytics/events.ts](../src/utils/analytics/events.ts)
2. Use it at the call site
3. (Optional) update the placement table in this doc

**Add a new builder action:**

1. Add the value to `BuilderAction`
2. Use it at the `builder_activated` call site

**Add a new event:**

1. Add a new union member to `AnalyticsEvent` with its prop interface
2. Call `trackEvent({ name: '...', props: { ... } })`
3. Register relevant breakdown props as custom dimensions in GA4 admin
4. Document the event in this file

**Don't:** add new properties to existing events without updating both the type definition and this doc. Schema drift in analytics events is the slowest bug to detect.

---

## Code locations

| File                                                                                  | Purpose                                                              |
| ------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| [src/utils/analytics.ts](../src/utils/analytics.ts)                                   | `trackEvent`, `useTrackedImpression`, `trackPageView`, `getPageType` |
| [src/utils/analytics/events.ts](../src/utils/analytics/events.ts)                     | Typed event registry — discriminated union of all events             |
| [src/utils/analytics/providers/google.ts](../src/utils/analytics/providers/google.ts) | gtag wrapper                                                         |
| [src/utils/analytics/types.ts](../src/utils/analytics/types.ts)                       | Provider interface                                                   |
| [src/routes/\_\_root.tsx](../src/routes/__root.tsx)                                   | gtag bootstrap, `PageViewTracker`                                    |
| [netlify.toml](../netlify.toml)                                                       | First-party proxy redirects                                          |

---

## Migration history

### 2026-05 — schema v2

Collapsed 28 events into 9. Removed `application_starter_*` event family. Replaced with `builder_*` events. Mode and idea selection moved from standalone events into session-context props on every builder event.

**Events removed entirely** (no replacement):

- `application_starter_library_toggled`, `_integration_toggled`, `_package_manager_toggled`, `_toolchain_toggled` — config exploration depth no longer tracked. Final config is on `builder_generated`.
- `application_starter_continue_clicked`, `_generate_clicked` — intent implied by outcome events.
- `application_starter_login_clicked`, `_value_copied` (auto), `_builder_result_applied`, `_final_partner_in_prompt`, `_final_addon_in_prompt`.

**Events folded into others:**

- `application_starter_action_clicked` (mode_selected) → `mode_used` prop on subsequent events
- `application_starter_idea_selected` → `idea_used` prop on subsequent events
- `application_starter_login_required` → `builder_failed[stage=login_blocked]`
- `application_starter_value_copied` (user trigger) → `builder_activated[action=copy_prompt]`
- All other `application_starter_action_clicked` calls → `builder_activated`
- `partner_card_clicked`, `partner_click` → `partner_clicked`
- `partner_impression`, `partner_detail_viewed` → `partner_viewed`
- `partners_filter_changed` → `partner_filter_applied`
- `partner_inquiry_clicked`, `become_partner_clicked` → `partner_inquiry_started`

Historical data with old event names is still queryable in GA4 and BigQuery. Cutover date: see git log for the migration commit.
