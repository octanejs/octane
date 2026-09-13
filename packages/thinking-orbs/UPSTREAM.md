# Thinking Orbs upstream contract

The release is `thinking-orbs@0.3.1`, from
[`bd204b73c9b6660fad7210b1ad48d9dc2adbb89d`](https://github.com/Jakubantalik/thinking-orbs/tree/bd204b73c9b6660fad7210b1ad48d9dc2adbb89d).
Its npm integrity is
`sha512-3BG1aeB1RUTxItCml/BBuIz5JRM4kZqGuyx+vouv0fXTtcR9ZNoKjWGneHPx94y74GxgArwJZ1qbJR5dt54kSw==`.
The source and published artifact contain the same MIT license, SHA-256
`915a283980628a0ca9e7b423ebafc6f3a0fa1e630ff17d34e59034808d92011c`, retained in
`LICENSE.upstream`.

## Ownership and exports

| Surface | Disposition |
| --- | --- |
| `ThinkingOrb` | Retained React-derived component, compiled for Octane, with its theme and reduced-motion hooks. |
| `ThinkingOrbProps`, `OrbState`, `OrbSize`, `OrbTheme` | Precise Octane canvas/native-event types and the upstream state, size and theme unions. |
| `resolvePreset`, `STATE_TO_MODE`, `MODE_DRAWS`, `ModeKey`, `Resolved` | Direct re-exports from the published `thinking-orbs/engine` dependency. |
| Upstream `./engine` geometry functions and types | Available directly from the ordinary `thinking-orbs/engine` dependency; no Octane-specific integration is required. |
| Upstream `./package.json` | Upstream package metadata, available from the ordinary dependency. |

## Source boundary

The source lock retains only `src/ThinkingOrb.tsx`, `src/theme.ts`, `src/types.ts`
and the license. These four pristine files verify against their exact Git blob
hashes. The adapted component and hooks are recorded in `audit/source-ledger.json`.
The geometry engine and presets are imported from upstream; their former local
copies are removed after the explicit mixed-ownership evidence migration.

The Octane component composes the consumer ref with its internal canvas ref.
Supplying a ref must preserve canvas sizing and drawing, as well as expose the
canvas for native focus and events. Effects retain upstream pause, visibility,
theme, reduced-motion and cleanup behavior. Server rendering emits accessible
canvas markup; effects begin on the client.

## Test inventory

This release has no registered runtime or type-test suite. Its npm `spec` script
runs two JSON generators, `scripts/extract-spec.ts` and `scripts/extract-golden.ts`.
The intake profile records their exact Git blobs and their generator purpose;
it rejects changed bytes, test registrations and recognized assertion calls.
They are not reported as passing tests. The registration inventory and crosswalk
are empty for that reason.

The binding's own conformance, differential, browser, hydration and public-type
checks cover the supported component and imported surface. Browser comparisons
use the pinned React component and actual canvas pixels. Tests exercise refs,
focus, native clicks, keyed survivor identity, updates, pause and teardown.
