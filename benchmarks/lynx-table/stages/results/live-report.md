# Post-#706/#707 template-ingress decomposition

## Baseline and protocol

- source: upstream `9b147781c9b4ec4df053a059633978ddc0ed922a`, #706 head `8d8883c8`, then both #707 commits ending at `71b758e7` (local integration `ecd18332` for the instrumented measurement branch)
- exact featured baseline: forward `2026-08-11T21-14-12-65160668d8d9-integration-706-707-featured.json`, reverse `2026-08-11T21-42-04-65160668d8d9-integration-706-707-featured-reverse.json`; every ReactLynx/Vue reference rebuilt from the same lockfile; 802 records per run and zero DNF/null cells
- decision-cell baseline medians: create@10k `1,994.7 / 2,075.3 ms`, replace@1k `261.2 / 270.3 ms`, append1k@1k `172.3 / 174.9 ms` forward/reverse
- measurement: fresh page per operation; control/profile alternates AB/BA; n=5 per cell; Chromium `149.0.7827.55`; direct intervals are exclusive; control/profile overhead stayed `1.046×`, `1.052×`, and `1.042×` at 1k/10k/30k create

Raw samples, spreads, endpoint maps, realm counters, hashes, host information,
and sample order are checked in as `live-1000.json`, `live-10000.json`, and
`live-30000.json` beside this report.

## Direct create attribution

| rows | profiled wall | BTS replay | clone/transfer | PAPI create | other host apply | ACK/publication | presentation residual |
|---:|---:|---:|---:|---:|---:|---:|---:|
| 1,000 | 148.3 ms | 26.9 ms (18.1%) | 0.6 ms (0.4%) | 62.0 ms (41.8%) | 41.0 ms (27.6%) | 0.5 ms (0.3%) | 13.2 ms (8.9%) |
| 10,000 | 1,201.5 ms | 146.1 ms (12.2%) | 4.0 ms (0.3%) | 578.2 ms (48.1%) | 341.7 ms (28.4%) | 0.6 ms (0.0%) | 119.0 ms (9.9%) |
| 30,000 | 3,498.6 ms | 344.5 ms (9.8%) | 11.0 ms (0.3%) | 1,791.0 ms (51.2%) | 993.0 ms (28.4%) | 0.6 ms (0.0%) | 300.0 ms (8.6%) |

PAPI creation scales at 62.0/57.8/59.7 μs per row and other host apply at
41.0/34.2/33.1 μs per row. ACK remains constant. Each create emits one shared
template run, exactly 1k/10k/30k instances, three values per row, no public
handle command, and the semantic-floor Row body count.

At 10k, replace@1k attributes 0.9% to clone/transfer, 16.0% to PAPI, 25.3% to
other apply, and 11.1% to ACK/publication. Append attributes 0.2%, 27.6%, 24.0%,
and 15.8% respectively. Even deleting ACK entirely cannot improve all three
required wall-clock cells by 15%.

## Endpoint ownership

The apparent large “total wire” is not an Octane commit packet. The page-side
Web Core boundary separates it:

| operation | MTS→BTS total | owner | BTS→MTS total | owner |
|---|---:|---|---:|---|
| create@10k | 19,608 B | Web Core control/event endpoints | 347,168 B | Octane host commit plus view events |
| replace@1k | 1,999,043 B | `dispatchCoreContextOnBackground` | 376,446 B | one `dispatchJSContextOnMainThread` commit |
| append1k@1k | 1,713,061 B | `dispatchCoreContextOnBackground` | 34,944 B | one `dispatchJSContextOnMainThread` commit |

The profile's direct Octane counters agree: append is one command, one template
run, 1,000 instances, and 3,000 scalar values; replace is 10,001 commands
because it retires the previous physical tree before mounting the one-run
replacement. The multi-megabyte opposite-direction payload is Web Core event
transport and cannot be halved by an Octane value/ACK encoding patch.

## Decision

- wire/value encoding: **NO-GO**; clone/transfer is 0.2–0.9%, below the required 10% owner gate, and Octane does not own the dominant total-wire direction.
- ACK-only change: **NO-GO**; it cannot satisfy the dual 50%-wire and 15%-latency acceptance gate, consistent with #45's negative control.
- observed owner: **split to PAPI/host materialization**; PAPI plus other apply owns 69.5–79.6% of create and remains linear. The current stack already uses the public dense intrinsic factories and append API introduced by #700, so there is no evidence-backed Octane representation experiment left in #47.

The measurement implementation and frozen results should land; no product
packet change should be proposed from this issue.
