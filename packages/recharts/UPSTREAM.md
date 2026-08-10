# Recharts upstream contract

## Pin and source boundary

| Field | Value |
|---|---|
| Package | `recharts` |
| Version | `3.9.2` |
| Canonical commit | `b3451050c027a23957ffa50a2665c9119df21e47` |
| Supported upstream range | exactly `3.9.2` |
| React oracle | `19.2.7` |
| Canonical archive SHA-256 | `4ea18e2d740eb795be14cfae42861fde31a024535ad853128efdf959c75045ff` |
| License | MIT |

The npm artifact publishes compiled output and declarations. The canonical
repository contains the TypeScript source and the large runtime/type-oriented
suite under `test/`. Those pristine artifacts are not yet vendored or executed
here, so the parity manifest records this pin as `recorded-unverified`.

## Export crosswalk

The Octane entry point ports the public chart families, cartesian and polar
axes, shapes, labels, tooltip/legend layers, responsive container, hierarchy
charts, animation helpers, layout hooks, scale/domain/tick hooks, matching
helpers, and coordinate/tick utilities exposed by Recharts 3.9.2. The static
shape, BarChart, and LineChart paths have byte-identical React differential
evidence in `tests/differential/parity.test.ts`.

`Brush` and `Treemap` are explicit gaps. Chart events use Octane's native
delegated event model rather than React synthetic events. SSR text measurement
returns zero dimensions and has no dedicated parity lane. These limitations are
also recorded in `status.json`; this package does not claim complete Recharts
parity outside the documented surface and evidence.

## Test-suite disposition

The tagged upstream repository contains extensive runtime and typed component
suites under `test/`. They have not yet been vendored, inventoried, or adapted
one-for-one. Existing Octane tests are repository-authored conformance and
differential cases. Only the three shared fixtures registered in the manifest
count as bounded React parity evidence.

Advancing to `verified` requires byte-exact vendoring, pristine runtime/type
execution, exhaustive upstream-artifact disposition, one-for-one adapted type
evidence, and classification of every Octane-authored test.
