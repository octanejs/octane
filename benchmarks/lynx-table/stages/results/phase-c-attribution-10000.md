# Lynx 10,000-row stage decomposition

- measured: 2026-08-16T05:01:12.471Z
- host: 32× Intel(R) Xeon(R) Platinum 8336C CPU @ 2.30GHz; linux 5.15.120.bsk.3-amd64; Node v22.22.2; Chromium 149.0.7827.55
- protocol: fresh page per sample; control/profile order alternates AB/BA; no retained first-screen batch or post-FCP command scan in the timing build
- host load: start 0.83/0.66/0.75 (1/5/15m), end 1.07/0.77/0.79
- repetitions: n=7 per A/B cell

## FCP@10000

Attribution starts when the shared browser hook assigns the hidden main-thread iframe Blob script URL, before load/parse/evaluation, and ends when the shared composed-tree observer first sees all 10,000 rows. Render, command staging, host prepare, host apply, and first-tree capture are directly timed. Nested plan and PAPI-create intervals are subtracted from their enclosing stages. `publication_layout_predicate_residual` is the exclusive remainder through Web Core publication, style/layout, and observer-frame delay.

| segment | median ms | min–max ms | share |
|---|---:|---:|---:|
| mt_slice_eval | 22.1 | 19.7–22.4 | 1.5% |
| plan_interpretation | 135.6 | 126.7–137.5 | 9.3% |
| first_screen_render_other | 7.3 | 6.4–8.1 | 0.5% |
| first_screen_command_staging | 13.4 | 11.2–17.2 | 0.9% |
| first_screen_host_container | 0.1 | 0.1–0.2 | 0.0% |
| first_screen_host_prepare | 143.7 | 133.5–152.2 | 9.9% |
| papi_element_creation | 532.6 | 502.7–547 | 36.5% |
| first_screen_host_apply_other | 429.5 | 421–487.9 | 29.4% |
| first_screen_capture | 90.2 | 82.5–99.9 | 6.2% |
| publication_layout_predicate_residual | 78.7 | 72.8–81.9 | 5.4% |

Raw view-attach FCP: profile 1484.8 ms (1409.1–1534.9), control 1407.7 ms; same-window profile/control 1.055×.

## Verdicts

- **first-screen generic command staging + host prepare owner gate: GO.** directly timed exclusive share is 10.8%; Phase B requires at least 10.0%.
