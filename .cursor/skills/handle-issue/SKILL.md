---
name: handle-issue
description: Work a GitHub issue in the octane repo. Use when given an issue number or link. Fetches the issue, classifies the owning area, and plans the fix.
---
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
   - Read `AGENTS.md`, `docs/packages.md`, and relevant docs.
   - For React-behavior issues, check `docs/differences-from-react.md` and classify intentional divergence vs bug.

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
Thanks: I triaged this as <classification> affecting <area>.

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
   - Classify issues with the existing `bug`/`enhancement`/`documentation`/`question` set. The
     `feat`/`fix`/`docs`/`test`/`perf`/`refactor`/`chore`/`ci` type labels are for PRs.
   - Add `agent-authored` to an issue an agent filed. When an agent only comments on someone
     else's issue, say so in the comment rather than relabelling their issue.
   - A PR that closes the issue is labelled by `create-a-pr`, not here.
