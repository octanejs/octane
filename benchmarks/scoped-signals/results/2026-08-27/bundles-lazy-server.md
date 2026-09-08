# Preliminary bundle measurement after lazy server setup

`bundles-lazy-server.json` reruns the same seven public-entry builds and exact
baseline after native server driver creation and serialization moved behind
the installed native capability. All boundary and export loading checks pass,
and no measured input changed during the run. The original
`bundles-preliminary.json` remains unchanged.

| Ordinary server entry | Raw bytes | Gzip bytes | Brotli bytes |
| --- | ---: | ---: | ---: |
| Baseline | 33,167 | 11,853 | 10,736 |
| Candidate before lazy setup | 38,270 | 13,710 | 12,391 |
| Candidate after lazy setup | 34,222 | 12,246 | 11,066 |
| Current difference from baseline | +1,055 | +393 | +330 |

The gzip increase is now 3.32%, down from 15.67%. The native collector, server
driver, and read protocol contribute no retained bytes to this ordinary
server entry; the seed module retains 36 bytes. All other entry sizes equal
the earlier report, including the ordinary client increase of 904 gzip bytes
(2.11%). These figures remain source-entry measurements, not compiled
applications or final acceptance evidence.

The invocation is identical to the first run except for
`BENCH_JSON=benchmarks/scoped-signals/results/2026-08-27/bundles-lazy-server.json`.
The complete command, runner and fixture hashes, dependency paths and hashes,
baseline Git-blob checks, and every exact source hash are in the JSON. Its
repository-formatted SHA-256 is
`a5aab3f4309d534e5f01128cfdecfef96bcea916c0f06035bb374c577793d882`.
`report-format-provenance.json` records the original run hash and verifies that
the single formatting pass left all parsed report values unchanged.
