# Skill: Handle an Octane GitHub issue

Use this to inspect an issue, triage it, propose a solution, and optionally implement it.

## Inputs

- Issue number or URL.
- Optional scope constraints: triage-only, propose-only, implement, or create PR.

## Workflow

1. **Fetch issue context**
   ```bash
   gh issue view <number> --json number,title,body,author,labels,state,comments,assignees,milestone,url
   ```
   If linked PRs/commits are mentioned, inspect them too.

2. **Classify**
   - bug, feature, docs, test gap, performance, parity gap, ecosystem binding, question.
   - affected area: core runtime, compiler, SSR/hydration, Vite plugin, binding package, benchmarks/docs.
   - severity and likely user impact.

3. **Check project rules**
   - Read `.ai/project-map.md`, `AGENTS.md`, and relevant docs.
   - For React-behavior issues, check `docs/react-parity-migration-plan.md` and classify intentional divergence vs bug.

4. **Reproduce or validate claim**
   - Prefer a minimal failing test or fixture.
   - If not reproducible, document missing info and ask targeted questions.
   - Avoid broad rewrites before there is a failing test.

5. **Propose solution**
   Include:
   - root-cause hypothesis
   - files likely to change
   - test plan
   - compatibility/divergence considerations
   - risk level

6. **Optional implementation**
   - Follow `bug-hunter.md` for bugs.
   - Follow `react-library-port.md` for binding/compat issues.
   - Follow `octane-core-extend.md` for runtime/compiler extensions.

7. **Issue response template**

```md
Thanks — I triaged this as <classification> affecting <area>.

Findings:
- ...

Likely cause:
- ...

Proposed fix:
- ...

Validation plan:
- ...

Notes:
- ...
```

8. **Labels/comments**
   - Use `gh issue edit`/`gh issue comment` only when asked or when operating autonomously with permission.
   - Do not close issues without maintainer instruction unless explicitly authorized.
