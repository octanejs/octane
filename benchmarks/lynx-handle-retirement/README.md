# Lynx handle-retirement benchmark

This Node-only suite measures the background client cost of preparing an exact
`remove-run` acknowledgement through the real `prepareLynxHandleDeltas` path.
It targets acknowledgement preparation, not native destruction or compact-host
mutation during `apply()`.

The harness bundles the TypeScript source with esbuild before loading it. Direct
Node imports cannot resolve the source tree's emitted `.js` specifiers, and a
mocked copy of the preparation logic would not protect the production path.

## Workloads

Both curves start from the same 65,568-host compact acknowledgement. Fixtures
and selected public handles are constructed outside timed regions. Each sample
warms and repeats 1,024 preparations, and scenario order reverses every iteration.

| curve | small target | large target | invariant |
| --- | ---: | ---: | --- |
| materialized handles | 1,024 | 65,536 | retire 8 contiguous hosts |
| compact retirement range | 1,024 | 65,536 | 64 materialized boundary handles |

The first curve catches preparation that scans every materialized handle to
retire a small run. The inverse curve catches a replacement that walks every
logical ID in a large, mostly unmaterialized compact range. Both large/small
ratios should stay at or below 1.5.

## Semantic controls

Every scenario is also applied and rolled back outside timing. The harness
checks that:

- every materialized handle inside the exact range becomes inactive and
  unreachable;
- materialized handles outside the range retain identity and stay active;
- an unmaterialized ID inside the retired range remains unreachable; and
- rollback restores the original materialized handle identities.

The per-target metadata records checksums for the materialized, retired, and
surviving IDs. Existing Lynx protocol tests remain responsible for malformed
transport identities, uncommanded runs, stale generations, and partial
per-handle fallbacks.

## Running

```bash
node benchmarks/lynx-handle-retirement/run.mjs 8
node benchmarks/bench.mjs --quick lynx-handle-retirement
node benchmarks/bench.mjs --quick --ratios lynx-handle-retirement
```

The operation is milliseconds per 1,000 exact acknowledgement preparations,
extrapolated from the repeated sample. Apply/rollback is deliberately excluded:
retiring compact metadata must mutate each host in the retired range, while the
preparation phase only needs to locate already-materialized entries.

## Main baseline

Recorded before changing the source implementation:

- source: `69a56855c21b71f824bdf1064d03e86b0a203eb9`
- runtime: Node `v26.7.0`
- command: `BENCH_JSON=/private/tmp/lynx-handle-retirement-baseline.json node benchmarks/lynx-handle-retirement/run.mjs 8`

| target | score (ms/1k) | min | p95 | RME | materialized / retired / survivor checksum |
| --- | ---: | ---: | ---: | ---: | --- |
| `handles-1024` | 9.665 | 7.528 | 15.837 | 27.2% | `1828363885 / 1463068797 / 2652267877` |
| `handles-65536` | 786.132 | 604.076 | 1090.923 | 15.6% | `702855789 / 1463068797 / 2681885029` |
| `range-1024` | 2.808 | 1.180 | 7.538 | 55.1% | `1124478021 / 3880120165 / 3077173093` |
| `range-65536` | 2.911 | 2.385 | 5.633 | 28.0% | `1124478021 / 3880120165 / 3077173093` |

The unmodified materialized-handle curve scaled by **81.34×**, reproducing the
unrelated-Map-scan penalty. The inverse compact-range curve scaled by **1.04×**,
confirming that its mostly unmaterialized IDs were not being walked. The direct
`handles-65536` pre/post result is recorded acceptance evidence and must improve
by at least 1.5× in this environment. It is not a portable ratio guard. The two
same-run large/small scaling ratios are the committed guards and must remain at
or below 1.5.
