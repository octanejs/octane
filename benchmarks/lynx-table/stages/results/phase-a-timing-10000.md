# Lynx 10,000-row stage decomposition

- measured: 2026-08-16T02:19:27.633Z
- host: 32× Intel(R) Xeon(R) Platinum 8336C CPU @ 2.30GHz; linux 5.15.120.bsk.3-amd64; Node v22.22.2; Chromium 149.0.7827.55
- protocol: fresh page per sample; control/profile order alternates AB/BA; no retained first-screen batch or post-FCP command scan in the timing build
- host load: start 0.56/1.24/1.53 (1/5/15m), end 1.25/1.33/1.55
- repetitions: n=7 per A/B cell

## FCP@10000

Attribution starts when the shared browser hook assigns the hidden main-thread iframe Blob script URL, before load/parse/evaluation, and ends when the shared composed-tree observer first sees all 10,000 rows. Render, command staging, host prepare, host apply, and first-tree capture are directly timed. Nested plan and PAPI-create intervals are subtracted from their enclosing stages. `publication_layout_predicate_residual` is the exclusive remainder through Web Core publication, style/layout, and observer-frame delay.

| segment | median ms | min–max ms | share |
|---|---:|---:|---:|
| mt_slice_eval | 20.3 | 19.6–22 | 1.3% |
| plan_interpretation | 124.5 | 122.1–132.4 | 7.9% |
| first_screen_render_other | 6.6 | 6.3–7.2 | 0.4% |
| first_screen_command_staging | 57.1 | 53.2–65.8 | 3.6% |
| first_screen_host_container | 0.1 | 0.1–0.2 | 0.0% |
| first_screen_host_prepare | 228.3 | 219.9–250.3 | 14.5% |
| papi_element_creation | 516.5 | 502–525.1 | 32.7% |
| first_screen_host_apply_other | 453.8 | 428.9–493.2 | 28.8% |
| first_screen_capture | 82.3 | 74.4–92.6 | 5.2% |
| publication_layout_predicate_residual | 73.5 | 72–77.3 | 4.7% |

Raw view-attach FCP: profile 1599.5 ms (1567.7–1633.2), control 1553.5 ms; same-window profile/control 1.03×.

## Verdicts

- **first-screen generic command staging + host prepare owner gate: GO.** directly timed exclusive share is 18.1%; Phase B requires at least 10.0%.
