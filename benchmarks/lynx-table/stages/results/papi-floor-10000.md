# Element PAPI speed-of-light floor @ 10,000 rows

- measured: 2026-08-13T13:33:01.915Z
- host: 18× Apple M5 Max; darwin 25.5.0; Node v24.18.0
- protocol: fresh page per sample; probe and octane control/profile cells interleave AB/BA in one window; probe phases are outer-timed bare public-PAPI loops in the same main-thread realm
- host load: start 5.20/5.46/4.86 (1/5/15m), end 4.55/5.31/4.81
- repetitions: n=5 per cell

## Bare-PAPI floor (outer-timed, same shape as one table row × N)

Single flush vs chunked (flush every ⌈rows/10⌉ appends, mirroring the ~10
incremental BTS→MTS batches octane applies).

| phase | single median ms | chunked median ms |
|---|---:|---:|
| factoriesMs | 139.2 | 136.3 |
| propsMs | 17.4 | 17.6 |
| eventsMs | 7.1 | 6.9 |
| treeMs | 54.5 | 48.2 |
| flushReturnMs | 0 | 0 |
| presentMs | 373.7 | 372.5 |
| totalMs | 586.3 | 583.6 |
| armToComposedMs | 588.4 | 585.6 |

## Octane in the same window

Raw create: control 313.9 ms, profile 325 ms.

| octane stage | median ms |
|---|---:|
| bg_replay | 41.6 |
| wire_clone_transfer | 1.1 |
| mt_validate | 3.1 |
| mt_expand | 0 |
| mt_prepare | 1.6 |
| papi_element_creation | 144.4 |
| mt_apply_other | 96.2 |
| mt_ack_publication | 0.1 |
| presentation_residual | 36.4 |

## Floor vs Octane

- probe factories (70000 elements): 139.2 ms vs octane papi_element_creation 144.4 ms
- probe props+events+tree: 79 ms vs octane mt_apply_other 96.2 ms
- probe total (arm→composed): 588.4 ms vs octane create wall 313.9 ms

## Verdicts

- **papi_element_creation collapsible share: NO-GO.** Floor is 96.4% of the stage; collapsible 5.2 ms = 1.7% of the create wall (owner gate: ≥10%). The factory calls themselves are host cost; only fewer calls change it.
- **mt_apply_other collapsible share: NO-GO.** Floor-equivalent props+events+tree is 82.1% of the stage; collapsible 17.2 ms = 5.5% of the create wall.
- **Flush batching: NO-GO.** Single-flush total 586.3 ms vs chunked 583.6 ms.
- Observation: the probe's one-shot foreign-task mutation pays 373.7 ms of post-flush presentation versus octane's 36.4 ms message-paced residual; this is renderer scheduling, not octane machinery, and does not enter the stage-floor comparison above.
