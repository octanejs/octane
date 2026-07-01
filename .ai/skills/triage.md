# Skill: Octane triage

Use this for quick classification of issues, failures, test output, or proposed work.

## Triage dimensions

- **Area:** runtime, compiler, SSR/hydration, Vite plugin, binding package, docs, tests, benchmark, tooling.
- **Type:** bug, feature, parity gap, intentional divergence, performance, flaky test, environment artifact, documentation.
- **Severity:** blocker, high, medium, low.
- **Confidence:** confirmed, likely, unknown, cannot reproduce.
- **Next action:** reproduce, write test, patch, document, defer, ask for info.

## Steps

1. Read `.ai/project-map.md`.
2. Inspect the concrete files/test output/issue text.
3. Compare against documented intentional divergences.
4. Identify the smallest owner and validation command.
5. Return a concise triage card.

## Triage card template

```md
## Triage
- Area: ...
- Type: ...
- Severity: ...
- Confidence: ...

## Evidence
- ...

## Likely owner
- Files/packages: ...

## Proposed next step
- ...

## Validation
- ...
```

## Label suggestions

- `area:runtime`, `area:compiler`, `area:ssr`, `area:hydration`, `area:vite`, `area:bindings`, `area:docs`, `area:perf`
- `type:bug`, `type:feature`, `type:parity`, `type:divergence`, `type:flaky`, `type:question`
- `priority:blocker`, `priority:high`, `priority:medium`, `priority:low`
