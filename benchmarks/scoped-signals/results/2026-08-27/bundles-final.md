# Frozen-source public-entry bundle comparison

All seven public-entry boundary and export-loading checks passed at merged
revision `508f9919f6e4dff8bf13c9fee5447720bd3eb688`, compared with the live main
baseline `97b42683ff64e561638fcc7580ba324e76458244`. No measured input changed
during the run. This replaces the baseline used for final comparison; the
earlier `ba9abbfb634786a1b081852f6eb51845f3d588fc` measurements remain unchanged.
The two baselines happen to produce identical ordinary-entry byte totals.

| Public entry                                        | Raw bytes | Gzip bytes | Brotli bytes |
| --------------------------------------------------- | --------: | ---------: | -----------: |
| Main baseline `octane` / `createRoot`               |   132,788 |     42,785 |       37,608 |
| Candidate `octane` / `createRoot`                   |   136,080 |     44,004 |       38,566 |
| Main baseline `octane/server` / `renderToString`    |    33,167 |     11,853 |       10,736 |
| Candidate `octane/server` / `renderToString`        |    34,222 |     12,246 |       11,066 |
| Candidate `octane/signals` / `createScope`, `query` |    28,792 |      9,193 |        8,339 |
| Candidate `octane/signals/client` / `useSignal$`    |    30,464 |     10,057 |        9,086 |
| Candidate `octane/signals/server` / `useSignal$`    |    29,556 |      9,562 |        8,688 |

The ordinary client increase is 3,292 raw bytes, 1,219 gzip bytes (2.85%), and
958 Brotli bytes. The ordinary server increase is 1,055 raw bytes, 393 gzip
bytes (3.32%), and 330 Brotli bytes. Neither ordinary entry resolves Alien or
the scoped engine. The independent engine resolves no renderer, compiler,
React, or DevTools; both optional native hook entries resolve Alien 3.2.0 from
the same pinned installation and their appropriate runtime.

These are exported source-entry costs using identical production esbuild
0.28.1 options, with ambient TypeScript configuration disabled, gzip level 9,
and Brotli quality 11. Optional hook entries are separate absolute costs;
they are not incremental app costs. The run does not compile `.tsrx`, render
an application, or replace the existing application bundle gates. The shared
runner's conservative `preliminary` tag remains unchanged in the raw report;
this note and the provenance sidecar identify the final frozen-source entry
comparison without upgrading it to application acceptance evidence.

The exact candidate input hashes include:

- Client runtime: `72d8c0efdb97e7763b2cfa7e74a13e8c24bd57a48b2b19aed121f17bd0537d49`
- Server runtime: `66d094c2ab47ae21c85a7d62c328edafa4230d8a778afa37a563759029360803`
- Graph: `719371959354ca916d11a76bb162eac93fb4efacf056d14290d5768bfe9dc3a5`
- Engine: `18eb70cbf0e4e44affa31adbf61d4adbfdfb1965aa975803e14f2ee3df2ac729`
- Requests: `71c13917b62d698b96fd74fbe23ac60fa8eae2c4515bb72b804c89693efd4a2a`

Every input and output bundle hash, retained-input byte contribution, resolved
package manifest, and baseline Git-blob check is recorded in
`bundles-final.json`. The baseline archive SHA-256 is
`80a8c4fb163302830d458a93b9c7d9965ed655208e260f5d6889edd80f284f59`.
The repository-formatted report SHA-256 is
`1094bfd0c1707535cbd508619133b9c8dede3b180a62e0fc624f23b7fa7dd16c`.
`bundles-final-format-provenance.json` preserves the raw-run hash and verifies
that JSON formatting changed no parsed values.

```bash
BENCH_JSON=benchmarks/scoped-signals/results/2026-08-27/bundles-final.json node benchmarks/scoped-signals/run-bundles.mjs \
  --baseline-ref=97b42683ff64e561638fcc7580ba324e76458244 \
  --baseline-package=/private/tmp/octane-scoped-bundle-baseline-final.BIvoPy/packages/octane \
  --tooling-root=/private/tmp/octane-scoped-signals-tooling.n1e5b0
```
