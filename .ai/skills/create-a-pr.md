# Skill: Create an Octane PR

Use this when asked to prepare a branch and pull request for an Octane change.

## Preflight

1. Ensure working tree state is understood:
   ```bash
   git status --short --branch
   git diff --stat
   ```
2. Read `.ai/project-map.md` and `AGENTS.md`.
3. Confirm no unrelated local changes are included.

## Branch and implementation hygiene

- Branch names: `fix/<short-topic>`, `feat/<short-topic>`, `docs/<short-topic>`, or `test/<short-topic>`.
- Keep commits focused.
- Add changesets for user-facing package changes; skip docs-only/test-only/internal tooling.
- If changing RuleSync source, edit `.rulesync/rules/*` and run `pnpm rules:generate`.

## Validation checklist

Run the smallest meaningful set and record results:

```bash
pnpm format:check
pnpm typecheck
pnpm test
```

Targeted alternatives are acceptable for small changes, but PR body must say what was and was not run.

## PR body template

```md
## Summary
- ...

## Why
- ...

## Changes
- ...

## Validation
- [ ] `pnpm format:check`
- [ ] `pnpm typecheck`
- [ ] `pnpm test`
- [ ] targeted tests: ...

## Risk / follow-ups
- ...
```

## Create PR with GitHub CLI

```bash
git checkout -b <branch>
git add <files>
git commit -m "<type>: <summary>"
git push -u origin <branch>
gh pr create --fill
```

If using `gh pr create --body-file`, write the PR body to a temp file and pass it explicitly.

## Final response

Return PR URL, branch, commit summary, and validation evidence.
