# Lynx 30,000-row production FCP baseline/candidate A/B

- measured: 2026-08-16T05:06:42.833Z
- host: 32× Intel(R) Xeon(R) Platinum 8336C CPU @ 2.30GHz; linux 5.15.120.bsk.3-amd64; Node v22.22.2; Chromium 149.0.7827.55
- protocol: fresh page per sample; production baseline/candidate order alternates AB/BA; neither cell reads profiler state
- repetitions: n=7 per baseline/candidate cell
- threshold: all rowCount=30000; settled finalRows=30000; finalCount=60000; checksum=4100383150
- baseline: /tmp/octane-fcp-baseline/benchmarks/lynx-table/app/dist-rows30000/main.web.bundle (495455 B, sha256 2c60090d7b387522e2094a23e40c98bac641a378e765210ad363b09c5d8ded28)
- candidate: /tmp/octane-fcp-template/benchmarks/lynx-table/app/dist-rows30000/main.web.bundle (499657 B, sha256 ee5e4ce2bed8cca41081636b29128d925bc3f9de6ec98d009a2ff88d2f9ac068)

| metric | baseline median (min–max) | candidate median (min–max) | candidate/baseline |
|---|---:|---:|---:|
| FCP | 4704.4 (4465.8–4942.3) ms | 4269.2 (4196.1–4579) ms | 0.907× |
| settled | 4704.4 (4465.8–4942.3) ms | 4269.2 (4196.1–4579) ms | 0.907× |
