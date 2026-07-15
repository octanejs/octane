---
targets: ['*']
description: 'Octane test quality and observation-boundary rules'
globs:
  - '**/*.test.*'
  - '**/*.spec.*'
  - '**/tests/**'
  - '**/_fixtures/**'
  - 'benchmarks/**'
---

# Test Quality and Observation Boundaries

Tests should protect behavior a consumer can observe, not the current route the
implementation takes to produce it. A regression test must have a credible
pre-fix failure and an oracle that would detect the user-visible regression.

## Default to behavioral tests

- Exercise public package entry points and realistic components, events, stores,
  SSR, hydration, or build flows. Prefer strengthening an existing scenario over
  adding a one-off file named after an internal helper or historical fix.
- Assert rendered output, DOM identity where identity is promised, state,
  effects, refs, focus, event propagation, errors, accessibility state, public
  return values, or published diagnostics. A test merely completing is not an
  oracle for convergence or cleanup when a bounded result can be asserted.
- Reproduce the consumer report in the smallest realistic fixture. Test names
  describe the contract, not the private function, fast path, queue, slot, or
  phase that was changed.
- A captured value must participate in a real assertion. Do not silence an
  unused capture with `void`, add tautological expectations, or assert only that
  setup succeeded.
- Keep comments about the durable contract and why the assertion matters.
  Remove implementation archaeology, stale `GAP` notes, positional source-line
  references, and claims the test does not actually prove.

## Respect the observation boundary

- Do not assert private helper names, temporary identifiers, binding-bag fields,
  slot symbols, `__*`/`$$*` properties, generated-code formatting, or exact
  internal call order. Refactors that preserve behavior should preserve the
  test result.
- Hydration tests assert server/client output, adoption of existing DOM nodes,
  preserved user state, live events/refs, focus, and mismatch diagnostics. Do
  not pin comment-marker spelling, marker multiplicity, or exact marker counts
  in correctness suites.
- Exact render counts, allocation identity, helper activation, DOM-node counts,
  bundle bytes, and codegen size are optimization claims. Put them in the
  deterministic benchmark/ratio system with semantic controls, not ordinary
  correctness tests. Only assert a count in a correctness test when the public
  API explicitly guarantees that count (for example, an effect cleanup firing
  once).
- Browser-only behavior belongs in the real-browser suites. Do not replace a
  browser contract with a jsdom mock of the framework internals.

## Compiler-test exceptions

Compiler diagnostics, source maps, public compile options, module/export shape,
and other published artifacts sometimes require source-level assertions. Even
then, compile and execute the result when practical and assert the narrowest
semantic property.

Use a parsed AST/source contract only when the required authoring pattern cannot
be distinguished behaviorally, such as an omitted dependency array or an
observed third tuple member. Avoid regexes over exact emitted helper aliases,
temporary numbering, whitespace, or statement layout. If raw output shape is
itself the optimization target, cover it through the codegen-size or bundle-size
benchmarks instead.

## Conformance and regression review

- React conformance ports cite the upstream case but assert Octane's observable
  outcome. Do not port Fiber, reconciler, lane, or synthetic-event internals as
  requirements. Intentional divergences remain ordinary passing behavioral
  tests with `// OCTANE DIVERGENCE:` rationale.
- Differential tests are preferred when the same fixture and interactions can
  run through Octane and the reference implementation. Add a focused identity,
  effect, focus, or move assertion only when HTML comparison cannot observe the
  promised behavior.
- Before keeping a new regression test, verify that a realistic broken
  implementation fails it and that materially different correct
  implementations pass it. In the handoff, state the pre-fix failure and the
  consumer-visible contract being protected.

Use the shared test harnesses for compilation, SSR, hydration, and differential
execution. Do not copy ad-hoc generated-module rewriting or `new Function`
loaders into another test file.
