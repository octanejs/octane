# Background render attribution @ 10,000 rows

- measured: 2026-08-12T20:17:34.674Z
- host: 4× Intel(R) Xeon(R) Processor @ 2.10GHz; linux 6.18.5-fc-v20; Node v22.22.2
- protocol: fresh page per sample; CDP sampling profiler attached to the lynx-bg worker only; wall is pointerdown to composed rowCount predicate
- host load: start 1.19/0.52/0.33 (1/5/15m), end 1.36/0.64/0.39
- repetitions: n=5; sampling interval 100 µs

## Fresh page (first create after boot)

Create wall: median 1396.5 ms. Background self time: 224.9 ms/sample.

| # | self ms/sample | share | function | snippet |
|---:|---:|---:|---|---|
| 1 | 47.5 | 21.1% | `(garbage collector)` | `` |
| 2 | 15.8 | 7.0% | `createPreparedTransaction` | `` |
| 3 | 11.4 | 5.1% | `a` | `` |
| 4 | 10.5 | 4.7% | `r` | `` |
| 5 | 7.3 | 3.2% | `createTransaction` | `` |
| 6 | 6.9 | 3.1% | `n` | `` |
| 7 | 6.6 | 2.9% | `eE` | `` |
| 8 | 5.2 | 2.3% | `postMessage` | `` |
| 9 | 4.9 | 2.2% | `P` | `` |
| 10 | 4.9 | 2.2% | `eH` | `` |
| 11 | 4.8 | 2.1% | `e$` | `` |
| 12 | 4.7 | 2.1% | `(anonymous)` | `` |
| 13 | 4.2 | 1.9% | `x` | `` |
| 14 | 4.1 | 1.8% | `u` | `` |
| 15 | 3.7 | 1.6% | `ex` | `` |
| 16 | 3.6 | 1.6% | `B` | `` |
| 17 | 3.3 | 1.5% | `a` | `` |
| 18 | 3.2 | 1.4% | `eT` | `` |
| 19 | 3.1 | 1.4% | `(anonymous)` | `` |
| 20 | 3.0 | 1.3% | `ro` | `` |
| 21 | 2.9 | 1.3% | `eZ` | `` |
| 22 | 2.8 | 1.2% | `rd` | `` |
| 23 | 2.8 | 1.2% | `t` | `` |
| 24 | 2.6 | 1.1% | `eo` | `` |
| 25 | 2.5 | 1.1% | `e3` | `` |
| 26 | 2.5 | 1.1% | `(anonymous)` | `` |
| 27 | 2.4 | 1.1% | `(anonymous)` | `` |
| 28 | 2.3 | 1.0% | `eG` | `` |
| 29 | 2.3 | 1.0% | `rY` | `` |
| 30 | 2.2 | 1.0% | `eS` | `` |

## Warmed page (featured-harness replica: 2×1k create/clear warmup, then per rep clear → gc(page) → timed create)

Create wall: median 1511.3 ms. Background self time: 565.8 ms/sample.

| # | self ms/sample | share | function | snippet |
|---:|---:|---:|---|---|
| 1 | 318.0 | 56.2% | `(anonymous)` | `` |
| 2 | 93.7 | 16.6% | `(garbage collector)` | `` |
| 3 | 16.2 | 2.9% | `a` | `` |
| 4 | 14.4 | 2.5% | `r` | `` |
| 5 | 11.0 | 1.9% | `createPreparedTransaction` | `` |
| 6 | 9.2 | 1.6% | `(anonymous)` | `` |
| 7 | 8.5 | 1.5% | `a` | `` |
| 8 | 6.5 | 1.1% | `createTransaction` | `` |
| 9 | 5.7 | 1.0% | `rd` | `` |
| 10 | 4.9 | 0.9% | `P` | `` |
| 11 | 4.4 | 0.8% | `postMessage` | `` |
| 12 | 3.3 | 0.6% | `n` | `` |
| 13 | 3.3 | 0.6% | `B` | `` |
| 14 | 3.3 | 0.6% | `x` | `` |
| 15 | 3.2 | 0.6% | `ro` | `` |
| 16 | 3.1 | 0.6% | `eo` | `` |
| 17 | 3.1 | 0.6% | `eS` | `` |
| 18 | 3.1 | 0.5% | `t` | `` |
| 19 | 2.7 | 0.5% | `eE` | `` |
| 20 | 2.4 | 0.4% | `eZ` | `` |
| 21 | 2.3 | 0.4% | `eG` | `` |
| 22 | 2.2 | 0.4% | `e3` | `` |
| 23 | 2.2 | 0.4% | `ex` | `` |
| 24 | 2.0 | 0.3% | `(anonymous)` | `` |
| 25 | 1.8 | 0.3% | `eE` | `` |
| 26 | 1.8 | 0.3% | `n` | `` |
| 27 | 1.7 | 0.3% | `(anonymous)` | `` |
| 28 | 1.6 | 0.3% | `eI` | `` |
| 29 | 1.5 | 0.3% | `u` | `` |
| 30 | 1.5 | 0.3% | `eH` | `` |

## Page realm (MTS + harness), fresh

Page-realm self time: 1298.8 ms/sample.

| # | self ms/sample | share | function | snippet |
|---:|---:|---:|---|---|
| 1 | 185.9 | 14.3% | `(garbage collector)` | `` |
| 2 | 109.4 | 8.4% | `setAttribute` | `` |
| 3 | 88.4 | 6.8% | `appendChild` | `` |
| 4 | 87.9 | 6.8% | `append` | `` |
| 5 | 79.3 | 6.1% | `cloneNode` | `` |
| 6 | 53.2 | 4.1% | `HTMLElement` | `` |
| 7 | 48.4 | 3.7% | `createElement` | `` |
| 8 | 39.9 | 3.1% | `l` | `` |
| 9 | 31.8 | 2.4% | `attachShadow` | `` |
| 10 | 26.1 | 2.0% | `wasm-function[52]` | `` |
| 11 | 23.3 | 1.8% | `removeProperty` | `` |
| 12 | 22.3 | 1.7% | `__CreateRawText` | `` |
| 13 | 20.5 | 1.6% | `l` | `` |
| 14 | 17.9 | 1.4% | `attributeChangedCallback` | `` |
| 15 | 17.7 | 1.4% | `__CreateText` | `` |
| 16 | 17.2 | 1.3% | `#W` | `` |
| 17 | 14.6 | 1.1% | `getAttributeNames` | `` |
| 18 | 14.3 | 1.1% | `_handleAttributeChange` | `` |
| 19 | 13.8 | 1.1% | `setAttribute` | `` |
| 20 | 13.5 | 1.0% | `Text` | `` |
| 21 | 13.3 | 1.0% | `(anonymous)` | `` |
| 22 | 12.4 | 1.0% | `wasm-function[288]` | `` |
| 23 | 12.3 | 1.0% | `(anonymous)` | `` |
| 24 | 12.0 | 0.9% | `i` | `` |
| 25 | 11.7 | 0.9% | `#H` | `` |
| 26 | 11.1 | 0.9% | `(anonymous)` | `` |
| 27 | 11.0 | 0.9% | `(anonymous)` | `` |
| 28 | 10.5 | 0.8% | `(anonymous)` | `` |
| 29 | 9.7 | 0.7% | `(anonymous)` | `` |
| 30 | 9.7 | 0.7% | `removeAttribute` | `` |

## Page realm (MTS + harness), warmed

Page-realm self time: 1183.9 ms/sample.

| # | self ms/sample | share | function | snippet |
|---:|---:|---:|---|---|
| 1 | 140.7 | 11.9% | `(garbage collector)` | `` |
| 2 | 115.0 | 9.7% | `setAttribute` | `` |
| 3 | 92.8 | 7.8% | `appendChild` | `` |
| 4 | 87.3 | 7.4% | `cloneNode` | `` |
| 5 | 87.1 | 7.4% | `append` | `` |
| 6 | 54.6 | 4.6% | `HTMLElement` | `` |
| 7 | 48.5 | 4.1% | `createElement` | `` |
| 8 | 42.7 | 3.6% | `(anonymous)` | `` |
| 9 | 31.6 | 2.7% | `l` | `` |
| 10 | 30.0 | 2.5% | `attachShadow` | `` |
| 11 | 27.4 | 2.3% | `__CreateRawText` | `` |
| 12 | 25.3 | 2.1% | `removeProperty` | `` |
| 13 | 20.3 | 1.7% | `#W` | `` |
| 14 | 18.1 | 1.5% | `__CreateText` | `` |
| 15 | 16.2 | 1.4% | `_handleAttributeChange` | `` |
| 16 | 15.9 | 1.3% | `rp` | `` |
| 17 | 14.8 | 1.3% | `apply` | `` |
| 18 | 13.5 | 1.1% | `getAttributeNames` | `` |
| 19 | 13.2 | 1.1% | `Text` | `` |
| 20 | 12.8 | 1.1% | `wasm-function[288]` | `` |
| 21 | 11.5 | 1.0% | `setAttribute` | `` |
| 22 | 11.1 | 0.9% | `(anonymous)` | `` |
| 23 | 10.0 | 0.8% | `removeAttribute` | `` |
| 24 | 9.7 | 0.8% | `i` | `` |
| 25 | 9.6 | 0.8% | `l` | `` |
| 26 | 9.6 | 0.8% | `(anonymous)` | `` |
| 27 | 9.4 | 0.8% | `wasm-function[124]` | `` |
| 28 | 8.6 | 0.7% | `(anonymous)` | `` |
| 29 | 8.5 | 0.7% | `wasm-function[52]` | `` |
| 30 | 8.5 | 0.7% | `(anonymous)` | `` |
