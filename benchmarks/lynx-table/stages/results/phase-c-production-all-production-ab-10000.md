# Lynx 10,000-row production FCP baseline/candidate A/B

- measured: 2026-08-16T05:03:49.858Z
- host: 32× Intel(R) Xeon(R) Platinum 8336C CPU @ 2.30GHz; linux 5.15.120.bsk.3-amd64; Node v22.22.2; Chromium 149.0.7827.55
- protocol: fresh page per sample; production baseline/candidate order alternates AB/BA; neither cell reads profiler state
- repetitions: n=7 per baseline/candidate cell
- threshold: all rowCount=10000; settled finalRows=10000; finalCount=20000; checksum=996039633
- baseline: /tmp/octane-fcp-baseline/benchmarks/lynx-table/app/dist-rows10000/main.web.bundle (495455 B, sha256 75b3ba592b2a9a93db0e4f28ed9a913f39c0fdb9a5faf46b9dd176ff9ef8665f)
- candidate: /tmp/octane-fcp-template/benchmarks/lynx-table/app/dist-rows10000/main.web.bundle (499657 B, sha256 ad086bedb8c910c9016134b8665a833038ab9fe06fb6795d76e9a8daedfad004)

| metric | baseline median (min–max) | candidate median (min–max) | candidate/baseline |
|---|---:|---:|---:|
| FCP | 1596.5 (1496.9–1697.9) ms | 1408.4 (1319.8–1523.4) ms | 0.882× |
| settled | 1596.5 (1496.9–1697.9) ms | 1408.4 (1319.8–1523.4) ms | 0.882× |
