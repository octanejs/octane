# Lynx 10k stage decomposition

- measured: 2026-08-10T00:01:42.807Z
- host: 32× Intel(R) Xeon(R) Platinum 8336C CPU @ 2.30GHz; linux 5.15.120.bsk.3-amd64; Node v22.22.2; Chromium 149.0.7827.55
- protocol: fresh page per sample; control/profile order alternates AB/BA; one vue-vdom create sample follows each pair; no other benchmark process ran in this window
- host load: start 0.84/1.29/2.53 (1/5/15m), end 1.68/1.49/2.48
- repetitions: n=5 per A/B cell

## FCP@10k

Attribution starts when the shared browser hook assigns the hidden main-thread iframe Blob script URL, before load/parse/evaluation, and ends when the shared composed-tree observer first sees all 10,000 rows. `layout_flush_residual` is the exclusive remainder after directly observed slice evaluation, plan interpretation, and PAPI element creation; it includes PAPI prop/insertion work, `__FlushElementTree`, Web Core DOM publication, style/layout, and observer-frame delay because the host exposes no stable boundary between those costs.

| segment | median ms | min–max ms | share |
|---|---:|---:|---:|
| mt_slice_eval | 17.7 | 17–22.3 | 0.8% |
| plan_interpretation | 124.4 | 119.7–127.7 | 5.4% |
| papi_element_creation | 496.8 | 487.2–517 | 21.7% |
| layout_flush_residual | 1659.7 | 1605.8–1709.5 | 72.5% |

Raw view-attach FCP: profile 2319.5 ms (2257.5–2402.8), control 2311.3 ms; same-window profile/control 1.004×.

## create@10k

Attribution starts at the shared pointerdown boundary and ends when the shared composed-tree observer sees 10,000 rows. `bg_replay`, `wire_clone_transfer`, `mt_expand`, and PAPI creation are directly observed exclusive intervals. `layout_flush_residual` is the wall-clock remainder, including event delivery before replay, validation/prepare, non-create PAPI work, flush/layout, scheduling, and observer-frame delay.

| segment | median ms | min–max ms | share |
|---|---:|---:|---:|
| bg_replay | 648.3 | 620–670.2 | 24.0% |
| wire_clone_transfer | 27.1 | 26.8–27.8 | 1.0% |
| mt_expand | 68.6 | 66.3–89.1 | 2.5% |
| papi_element_creation | 551.9 | 535.4–597.6 | 20.4% |
| layout_flush_residual | 1406.1 | 1386.4–1434.9 | 52.0% |

Raw create: profile 2701.8 ms (2635.1–2806.3), control 2658 ms, vue-vdom 1369.5 ms; same-window profile/control 1.016×, profile/vue-vdom 1.973×.

## Verdicts

- **s2-2 (#18): NO-GO.** plan interpretation is 5.4% of attributed FCP and instantiate expansion is 2.5% of create; neither clears the 10% direct-share gate.
- **s2-3 (#19): NO-GO from this instrument.** This issue measures mount/FCP, not slot-update routing; the roadmap already records point updates inside the target band, so no measured mount share justifies updater staging here.
- **s2-4 (#20): NO-GO.** receiver slice evaluation plus plan interpretation is 6.2% of attributed FCP and wire is 1.0% of create; neither clears the 10% direct-share gate, and the create residual is deliberately not attributed to receiver code.
