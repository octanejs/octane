# Signal-start example for issue 1319

Run `node benchmarks/streamed-shell-prototype/issue-1319/run.mjs` from the
checkout. It compiles and executes two small, otherwise equivalent streamed SSR
fixtures with the existing production server compiler. The loader promises are
controlled: the script waits for the pending UI, records which requests started,
then resolves A and B, and checks that both streams finish with `AB` and no
reported error. Generated bundles are written under a fresh temporary directory.

The direct reads start both independent requests before either is resolved. When
the same handles are accessed through an object, the compiler does not currently
prove them independent: only A starts initially, and B starts after A resolves.
This deliberately demonstrates a workload where a diagnostic like issue 1319's
proposed completeness fact could explain an existing missed parallel start and
suggest a direct-read rewrite. No such diagnostic is implemented here. The
prototype does not measure latency, transfer, or client bundle savings, and it
does not show that those proposals prove a shell's lifetime or eligibility.

## Relationship to the shell experiment

The five proposals in [issue 1319](https://github.com/octanejs/octane/issues/1319)
address different problems:

- Typed failures (A) and action concurrency (B) change author-facing signal
  contracts; neither proves that a parent can be omitted from hydration.
- Development proof checks (C) could catch some incorrect assumptions in the
  paths they observe. They are intended to leave production output unchanged,
  and a passing observed path cannot prove every future path is inert.
- Mutation gates (D) test whether existing suites catch specified regressions;
  they do not remove production code.
- Completeness facts (E) could explain missing signal-start proofs, as the
  experiment above illustrates. A read-site fact is not a root-lifetime,
  module-side-effect, DOM-ownership, or hydration-fallback proof.

There are also issue details to resolve before implementing them. The proposed
fix of adding a side-effect `octane/signals` import does not currently make
imported handles eligible for independent starts: the compiler's existing
[negative test](../../../packages/octane/tests/compiler/signal-declarations.test.ts)
includes that import. A `sync: true` scalar derivation is currently an author
assertion and the existing tests show it retaining a thenable as a value;
rejecting it would change that contract. A typed `@catch` annotation currently
does not filter runtime errors, so selectively propagating unmatched errors
would also need an explicit compatibility decision. Finally, an undeclared
error represented as `unknown` absorbs a declared error union in TypeScript;
exhaustiveness requires a clearly specified closed-contract policy.
