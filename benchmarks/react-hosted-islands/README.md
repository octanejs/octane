# react-hosted-islands

Structural baseline for **React-hosted Octane compat islands**
([docs/react-hosted-octane-compat-plan.md](../../docs/react-hosted-octane-compat-plan.md)
§8.1/§11/§13, recorded by Phase 0). Node-only, jsdom, production React 19 plus
the real compiled Octane runtime; every number is a deterministic structural
**count**, not a timing.

The fixture mounts one React root owning N host elements, then one hosted
Octane root (bound to a minimal `RendererRegionOwnerBridge` owner) per host —
the plan's island architecture with no contexts or suspensions, so the counts
isolate per-island structural cost at N ∈ {1, 100, 1000}.

## What a bad number points at

| op | meaning | today (baseline) |
| --- | --- | --- |
| `empty_listeners_per_island` | Octane listeners on a host whose island binds NO events | 5 (= every loaded delegated type) |
| `one_click_listeners_per_island` / `all_click_listeners_per_island` | same, with one/all islands binding `click` | 5 — identical to empty: cost is O(islands × loaded types), independent of use (§8.1) |
| `react_root_listeners` | React 19's own listener set at ITS root container | 138, constant per React root |
| `bridge_bindings_per_island` | owner-bridge registrations per hosted root | 1 |
| `late_delegate_backattach_total` | listener adds when `delegateEvents()` learns a new type with N live roots | N (O(islands) back-attach) |
| `leaked_listeners_after_unmount` | island listener adds − removes after full teardown | 0 (gate: run fails if not) |

The empty/one-click/all-click **equality** is the point of the baseline:
Phase 5's selective hosted delegation must drop the empty/unused cost toward
zero (`O(sum of event types actually used per island)`), while
`baselines/ratios.json` guards that per-island cost never grows super-linearly
with island count in the meantime.

## Run

```bash
node benchmarks/react-hosted-islands/run.mjs            # builds dist/, then measures
node benchmarks/react-hosted-islands/run.mjs --no-build # reuse dist/
node benchmarks/bench.mjs react-hosted-islands          # via the unified runner
```

The build is a client-mode vite lib bundle (octane compiled in from workspace
source, react/react-dom external so NODE_ENV=production selects their prod
builds at import). `--quick` is accepted for runner symmetry but changes
nothing — the counts are exact.
