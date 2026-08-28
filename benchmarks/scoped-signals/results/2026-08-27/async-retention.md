# Async producer retention diagnostic

The fixed engine released every disposed workload scope, signal node, request
entry, and stream iterator in this bounded diagnostic, even while unresolved
producer promises remained externally reachable. The original run found a
real iterator retainer and is preserved in `async-retention.json`.

Both runs created and disposed one promise owner and one stream owner per
cycle in one Node process, using the actual production-bundled public
`octane/signals` API and pinned Alien Signals 3.2.0. The producers observed
abort/return calls but never settled their promise, `next()`, or `return()`
results. The workload kept only those producer promises and one intentional
live scope externally reachable. It did not retain disposed scopes, signal
handles, or closures over them.

| Checkpoint                         | External pending promises | Live scopes | Signal nodes | Request entries | Iterators before fix | Iterators after fix |
| ---------------------------------- | ------------------------: | ----------: | -----------: | --------------: | -------------------: | ------------------: |
| Cycle 0, control live              |                         2 |           1 |            4 |               2 |                    1 |                   1 |
| Cycle 100, 200 owners disposed     |                       302 |           1 |            4 |               2 |                  101 |                   1 |
| Cycle 1,000, 2,000 owners disposed |                     3,002 |           1 |            4 |               2 |                1,001 |                   1 |
| Control retired and dropped        |                     3,003 |           0 |            0 |               0 |                1,001 |                   0 |
| External promises released         |                         0 |           0 |            0 |               0 |                    0 |                   0 |

The scope/node/request counts were the same before and after the fix: only
the positive control survived, then none remained after it was dropped. The
iterator path in the failing run was the external producer array → unresolved
stream-return Promise → PromiseReaction → rejection closure → closure context
→ iterator. The empty rejection closure shared `closeIterator`'s context with
other closures that captured its iterator parameter. Moving that rejection
handler to module scope removed this path. Only `requests.ts` changed among
the measured engine inputs between runs.

The fixed run still retained 2,000 revoked attempt records after the 1,000
cycles, then 2,002 after control disposal. This is expected while their
original producer promises remain unresolved: each record has already
released its entry, controller, and iterator. All those attempt records
disappeared after the external promise array was released. Total heap growth
was therefore not used as a leak oracle.

The offline scanner identifies Scope and signal objects by their public
prototype methods, then reads the storage fields of the exact hashed source
revision for labels and retainer analysis. Its positive control must expose
one scope, four nodes, two requests, two active attempts, and all marked
producer promises before zero counts are accepted. The scanner originally
also counted one V8 AllocationSite object-literal template as an Attempt. The
refined classifier requires an actual `settled` Promise and resolver closure
and reports templates separately. Reanalysis of the original heaps in
`async-retention-before-fix-analysis.json` preserves the identical iterator
counts and paths. Two synthetic scanner tests verify weak-edge exclusion and
the distinction between live records and allocation templates.

The worker and runner hashes are identical across runs. Both used Node
26.4.0, esbuild 0.28.1, the same pinned Alien installation, identical production
build options, 1,000 cycles, and three explicit collections after event-loop
turns per checkpoint. The engine bundle hashes were:

- Before: `9d64d01a030da099e5a4d5349c344ea6fe061b8a932cc8a7155731e73cd45db6`
- After: `2c440a8c43821ed22aadd91774ded3044c2080e6be107295d0bd818d5aefd39d`

The fixed run used:

```bash
BENCH_JSON=benchmarks/scoped-signals/results/2026-08-27/async-retention-fixed.json node benchmarks/scoped-signals/run-async-retention.mjs \
  --tooling-root=/private/tmp/octane-scoped-signals-tooling.n1e5b0 \
  --snapshots=/private/tmp/octane-scoped-async-retainers-fixed-20260827 \
  --cycles=1000
```

The fixed report's repository-formatted SHA-256 is
`3263a4fa9ba85a65a2edf4c5dbbadaea04ef45ea1d2e35214bb7fb038b089b6b`.
The original failure report's formatted SHA-256 is
`835329acc4178bc61f9d6fa101c8d5ed99b3cfd15c7f306fe0f5289c5f18c4ff`.
`async-retention-format-provenance.json` records the raw-run hashes and the
verified unchanged parsed values after the single JSON formatting pass.
All exact input hashes, tool paths, worker command, snapshot hashes, memory
samples, and observed retainer paths are in the reports. Raw heaps remain
under the two recorded `/private/tmp` snapshot directories.

This establishes only the observed data-owner and producer-retirement
behavior of these source revisions. It creates no historical frames and
does not establish browser, native DOM, DevTools, or general application
retention. It is separate from the 27-case native source ABI smoke, whose
supersession controls overlap the earlier five-case independent probe.

## Final-source retention rerun

`async-retention-final.json` reruns the unchanged 1,000-cycle workload after
the cancellation-reentrancy guards and untracked abort-callback delivery were
added. Its runner, worker, inspector, and build-option hashes match the fixed
run above; only `requests.ts` changed among measured engine inputs. Its source
SHA-256 is
`71c13917b62d698b96fd74fbe23ac60fa8eae2c4515bb72b804c89693efd4a2a`, and the
production engine bundle SHA-256 is
`6307962f65d1f6a23339e6f53555871002a110b194406a2e0a53ea301850a79f`.

All five checkpoints passed with the same counts as the fixed run: only the
live control's scope, four nodes, two requests, and one iterator survived the
2,000 owner disposals. After control retirement those counts were zero while
3,003 pending producer promises remained externally reachable. All 2,002
revoked attempt shells disappeared once those external promises were
released. The two scanner tests also passed.

The new report's repository-formatted SHA-256 is
`a52ecb3c01a13f0d37d33e92e7dcfad7cbb2248163c6bf2039c3b95a5a78b181`.
`async-retention-final-format-provenance.json` records the raw-run hash and
the checked equality of parsed values after formatting. Earlier report
hashes were verified unchanged. Raw heaps remain at
`/private/tmp/octane-scoped-async-retainers-final-20260827`. This is retention
evidence only; package, bundle, and timing checks are separate.
