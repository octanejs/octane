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
suite under `test/`. The complete pristine suite is not yet vendored or executed
here, so the parity manifest remains `recorded-unverified`.

## Strict consumer source restoration

The repair for Octane issues #726 and #721 restores the authored TypeScript
counterparts of 123 compiled JavaScript modules, together with missing type
support, from the same immutable commit. This does not upgrade Recharts.
[`type-source-restoration.json`](./type-source-restoration.json) records the
139 copied source paths and hashes, existing port import adaptations, and the
status of the bounded source/runtime checks. [`LICENSE.recharts`](./LICENSE.recharts)
is the exact upstream MIT notice and is included in the published package.

Existing Octane hook-slot routing, Cell registration, and native event adapters
are retained. Restored types describe native events, Octane renderables, and
renderer-specific SVG props and ref sinks. The intentional event correction
removes React's `persist()` call from the existing deferred native-event proxy;
target capture, native method binding, and frame scheduling remain unchanged.
The missing pinned polar-coordinate guard is also restored for existing cursor
paths; the other handwritten runtime helpers are preserved.

The private store uses the compatible Redux Toolkit 2.10 / Immer 10 dependency
family. This avoids Immer 11's conflicting global `Iterator` declaration in
strict ESNext consumer programs without a consumer-side library-check bypass.

The source audit separately compares the old JavaScript to the pinned npm
artifact and type-erased restored TypeScript to the pinned repository source.
It does not equate modern authored syntax with downlevel compiler output.
All 123 old JavaScript modules match the pinned npm artifact after the
documented import normalization. Of 139 restored source modules, 134 match
after type erasure; the five reviewed differences preserve three existing
compiled presets, correct native-event persistence, and retain the handwritten
Octane helpers while restoring the missing polar guard. The 25 existing
authored TypeScript modules retain their runtime bodies except for that guard.
Strict source checks pass, including both D3 declaration versions encountered
in combined consumer installs. All normal-root runtime shards and the complete
tarball validation pass, including a browser-only ESNext consumer of all five
bindings reported in #721. The record distinguishes focused conformance counts
from the full-root result; current-head CI is reported separately on the PR.
These checks do not replace the upstream suite disposition below or establish
complete upstream parity.

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
