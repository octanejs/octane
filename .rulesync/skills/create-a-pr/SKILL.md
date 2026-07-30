---
targets: ['*']
name: create-a-pr
description: Open a pull request for octane work. Load before creating the branch, commit, changeset, or PR, including when opening a PR is the tail step of a task that was about something else.
---

# Skill: Create an Octane PR

Use this when asked to prepare a branch and pull request for an Octane change.

## Preflight

1. Ensure working tree state is understood:
   ```bash
   git status --short --branch
   git diff --stat
   ```
2. Read `AGENTS.md` and `docs/packages.md`.
3. Confirm no unrelated local changes are included.

## Branch and implementation hygiene

- Branch names: `fix/<short-topic>`, `feat/<short-topic>`, `docs/<short-topic>`, or `test/<short-topic>`.
- Keep commits focused.
- Add changesets for user-facing package changes; skip docs-only/test-only/internal tooling.
- If changing RuleSync source, edit `.rulesync/rules/*` and run `pnpm rules:generate`.

## Validation checklist

During iteration, format or check one or more changed files/directories without
scanning the repository:

```bash
pnpm format:files <path...>
pnpm format:files:check <path...>
```

Then run the smallest meaningful final set and record results:

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
gh pr create --draft --fill
gh pr edit <number> --add-label <type> --add-label agent-authored
```

If using `gh pr create --body-file`, write the PR body to a temp file and pass it explicitly.

Label after the PR exists rather than with `gh pr create --label`, so a rejected
label cannot cost you the PR. An outside contributor's token has no rights to
label at all; when the edit fails, leave the PR open and name the intended labels
in the final response.

## Leave the PR as a draft

Open every PR as a draft and stop there. Nothing has run against the pushed diff
yet, and the draft state is what says so. Marking it ready for review is the
maintainer's job, and so is merging. Report the PR URL and end the task.

Do not sit on `gh pr checks --watch` either. Repository CI intentionally skips
every job while the pull request is a draft and starts on the
`ready_for_review` event. Cursor Bugbot still reviews every pull request,
including drafts, outside Actions, so people can watch and respond to its issue
comments before making a draft ready. Vercel may also report separately.

`.github/workflows/draft-agent-prs.yml` converts an `agent-authored` PR that was
opened outside draft back into a draft, so a forgotten `--draft` costs a round
trip instead of passing unnoticed. It leaves the PR alone once anyone has marked
it ready for review, so it never undoes `gh pr ready`.

## Labels

Every PR carries exactly one type label. Every PR whose diff an agent produced
also carries `agent-authored`.

- Type: the conventional-commit type already in the PR title, one of `feat`,
  `fix`, `docs`, `test`, `perf`, `refactor`, `chore`, `ci`. A `feat(lynx): …`
  title takes `feat`. Never apply two.
- `agent-authored`: apply whenever an agent wrote the change, no matter which
  account pushes it. The author field cannot show this, because an agent commits
  under the human's credentials, so the label is the only signal that separates
  human PRs from agent PRs. Absence of the label asserts a human wrote the diff:
  never drop it to make a PR read as hand-written. Humans add nothing, and
  `-label:agent-authored` is the human-authored filter.
- `bug` and `enhancement` belong to issues. Do not put them on a PR.
- Do not invent labels. `gh label list` is the full set; adding a type means
  creating the label in the repo first.

## Final response

Return PR URL, branch, commit summary, labels applied, and validation evidence.
The PR stays a draft.
