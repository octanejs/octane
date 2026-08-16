# Issue 57: clear teardown

All reportable browser runs used the same machine (`65160668d8d9`, Intel Xeon Platinum 8336C), pinned Playwright Chromium 1228, the same lockfile, production bundles, seven repetitions, and zero DNF. The runner writes the source JSON before the historical `collect` guard rejects an unrelated old comparison run whose manifest commit predates current upstream; that post-run guard does not invalidate the recorded samples.

## Result

The direct, pristine 10,000-row clear is now in the React/Vue tier in both measured orders.

| Order | Octane candidate | React | Fastest comparable Vue | Octane / React | Octane / Vue |
| --- | ---: | ---: | ---: | ---: | ---: |
| forward | 259.880 ±17.478 ms | 325.015 ms | 223.270 ms | 0.800× | 1.164× |
| reverse repeat | 267.950 ±23.304 ms | 327.885 ms | 247.585 ms | 0.817× | 1.082× |

The exact Octane samples were:

- forward: `294.090, 236.650, 241.485, 262.685, 252.470, 265.945, 259.880`
- reverse: `302.295, 227.780, 232.665, 267.950, 261.500, 270.690, 268.625`

One earlier reverse cohort measured 308.100 ±16.300 ms against Vue at 242.200 ms (1.272×). Repeating the identical bundle order produced the passing reverse result above; the outlier run remains part of the laboratory record instead of being silently discarded.

Against upstream main, the candidate improved in both adjacent orders:

| Order | Upstream | Candidate | Change |
| --- | ---: | ---: | ---: |
| upstream → candidate | 391.105 ms | 297.995 ms | -23.8% |
| candidate → upstream | 363.455 ms | 293.345 ms | -19.3% |

The original same-machine upstream cohort was 379.570 ±38.932 ms. Its raw samples were `379.570, 339.455, 372.095, 363.045, 420.430, 465.245, 409.675`.

## Attribution

| Direct owner | Upstream profile | Candidate profile | Count before → after |
| --- | ---: | ---: | ---: |
| destroy-run expansion | 13.710 ms | 0 ms | 100,000 synthesized commands → 0 |
| dense validation | 31.405 ms | 0.550 ms | full expanded validation → direct certification |
| event teardown | 33.435 ms | 0.035 ms | 20,000 explicit native unbinds → structural lifetime + one journal clear |
| Element PAPI removal | 175.960 ms | 175.520 ms | 10,000 → 10,000 root removals |
| dense release | 0.035 ms | 0.030 ms | 70,000 hosts → 70,000 hosts |

The retained path only accepts a sole, exact, full, uniform destroy-run over its untouched dense store. Partial, reordered, mutated, non-uniform, portal/list/ref/main-thread-prop, explicit-generation, faulted, and reused states retain the existing expansion and validation path. Native event journal release occurs only after every root removal succeeds, so before/after PAPI faults retain complete terminal-disposal authority.

## Secondary costs

| Metric | Upstream | Candidate | Delta |
| --- | ---: | ---: | ---: |
| web bundle raw / gzip | 495,178 / 135,660 B | 497,310 / 136,123 B | +2,132 / +463 B |
| Lynx bundle raw / gzip | 483,645 / 162,910 B | 485,217 / 163,598 B | +1,572 / +688 B |
| MTS heap @10k | 52,722,292 B | 51,964,544 B | -757,748 B |
| BTS heap @10k | 26,416,184 B | 26,415,924 B | -260 B |
| clear wire to MTS | 310 B / 1 message | 310 B / 1 message | unchanged |
| clear wire to BTS | 830 B / 4 messages | 832 B / 4 messages | +2 B |

## Challenge matrix

The AB/BA challenge covered create, replace, append, update every tenth row, select, swap, single remove, non-pristine fallback clear, 50-update storms, 30-select storms, and startup at 0/1,000/10,000/30,000 rows. All 38 latency/FCP cells completed with zero DNF. No cell regressed by more than 5% in both orders.

The largest-state checks were:

| Cell | AB change | BA change |
| --- | ---: | ---: |
| create @10k | +0.7% | +4.0% |
| update10th @10k | -4.7% | -0.3% |
| non-pristine fallback clear @10k | -1.0% | +1.2% |
| update storm @10k | 0.0% | +10.4% |
| select storm @10k | +6.1% | +3.6% |
| startup FCP @10k | -3.7% | -0.6% |
| startup FCP @30k | -0.7% | +2.4% |

The single-order storm movements did not reproduce in the opposite order and their confidence intervals overlap.

## Rejected candidates

- A single `__ReplaceElements(parent, [], oldRoots)` call measured 321.890 ms versus its 312.695 ms control. It compressed the JS-to-PAPI boundary but Web Core still looped over DOM removals internally.
- Removing roots last-to-first measured 343.535 ms versus 312.695 ms and increased the PAPI span.
- Packing the root array saved 0.0015 ms per 10,000 calls; four-way loop unrolling saved 0.0127 ms. Neither is material relative to the remaining native removal owner.
- Fast Vue represents text as a `text` attribute while Octane owns independent `#text`/`raw-text` hosts. Lynx's public text authoring types and Octane's identity, first-screen, generation, and cleanup contracts provide no safe small fusion boundary, so this was not used as a benchmark-only shortcut.

Structured evidence, including raw samples and counters, is in `issue57-clear-teardown.json`.
The nine source runner files are committed as deterministic `.json.gz` archives
under `issue57-clear-teardown-runs/`; the structured evidence records their
SHA-256 digests and the baseline/candidate bundle hashes for every autorow build.
