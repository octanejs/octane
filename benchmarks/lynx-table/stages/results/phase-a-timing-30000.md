# Lynx 30,000-row stage decomposition

- measured: 2026-08-16T02:23:21.166Z
- host: 32× Intel(R) Xeon(R) Platinum 8336C CPU @ 2.30GHz; linux 5.15.120.bsk.3-amd64; Node v22.22.2; Chromium 149.0.7827.55
- protocol: fresh page per sample; control/profile order alternates AB/BA; no retained first-screen batch or post-FCP command scan in the timing build
- host load: start 1.45/1.38/1.55 (1/5/15m), end 2.67/1.90/1.72
- repetitions: n=7 per A/B cell

## FCP@30000

Attribution starts when the shared browser hook assigns the hidden main-thread iframe Blob script URL, before load/parse/evaluation, and ends when the shared composed-tree observer first sees all 30,000 rows. Render, command staging, host prepare, host apply, and first-tree capture are directly timed. Nested plan and PAPI-create intervals are subtracted from their enclosing stages. `publication_layout_predicate_residual` is the exclusive remainder through Web Core publication, style/layout, and observer-frame delay.

| segment | median ms | min–max ms | share |
|---|---:|---:|---:|
| mt_slice_eval | 26.4 | 25–27 | 0.6% |
| plan_interpretation | 382.3 | 376.4–438.6 | 8.1% |
| first_screen_render_other | 16 | 14.3–18.2 | 0.3% |
| first_screen_command_staging | 166.1 | 156.7–182.5 | 3.5% |
| first_screen_host_container | 0.1 | 0.1–0.2 | 0.0% |
| first_screen_host_prepare | 565 | 541.2–570.6 | 11.9% |
| papi_element_creation | 1743.3 | 1666.3–1811.9 | 36.7% |
| first_screen_host_apply_other | 1416 | 1356.4–1604.6 | 29.8% |
| first_screen_capture | 249.6 | 238–300.5 | 5.3% |
| publication_layout_predicate_residual | 219.9 | 202.8–238.3 | 4.6% |

Raw view-attach FCP: profile 4771.8 ms (4640.6–5159), control 4571.3 ms; same-window profile/control 1.044×.

## Verdicts

- **first-screen generic command staging + host prepare owner gate: GO.** directly timed exclusive share is 15.4%; Phase B requires at least 10.0%.
