---
name: create-a-pr
description: >-
  Open a pull request for octane work. Load before creating the branch, commit,
  changeset, or PR, including when opening a PR is the tail step of a task that
  was about something else.
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

Immediately before committing and pushing, synchronize the repository and
review the resulting diff. Include every relevant generated change in the
commit:

```bash
git checkout -b <branch>
pnpm sync
git status --short
git add <files>
git commit -m "<type>: <summary>"
git push -u origin <branch>
gh pr create --draft --body-file <file>
```

Write the body to a temp file and pass it explicitly. Do not use `--fill`: it
builds the body from your commits and drops the template, taking the provenance
section with it.

Apply no labels, and never pass `--label`. Your token has no rights to label at
all when the PR comes from a fork, and `.github/workflows/label-pr.yml` applies
both labels as a bot, which does.

## Leave the PR as a draft

Open every PR as a draft and stop there. Nothing has run against the pushed diff
yet, and the draft state is what says so. Marking it ready for review is the
maintainer's job, and so is merging. Report the PR URL and end the task.

Do not sit on `gh pr checks --watch` either. Repository CI intentionally skips
every job while the pull request is a draft and starts on the
`ready_for_review` event. Cursor Bugbot still reviews every pull request,
including drafts, outside Actions, so people can watch and respond to its issue
comments before making a draft ready. Vercel may also report separately.

## Declare provenance in the PR body

Keep the provenance section from `.github/pull_request_template.md` in the body
you write, and tick the box, because an agent produced the diff:

```md
## Provenance

- [x] An agent produced this diff (`agent-authored`)
```

Leaving the box clear is a positive claim that a human wrote the diff, so it is
never the safe thing to do when unsure. An agent commits under a human's
credentials, which is why nothing else in the PR can tell the two apart.

`.github/workflows/label-pr.yml` reads the box and applies `agent-authored`. It
runs as a bot with the repository's own token, so this works identically from a
fork and needs nothing from a maintainer.

Omitting the section **fails the check**, which is why `--fill` is not an option.
It still labels the PR first, so the only thing left to fix is the body, and
editing the body re-runs the check. A missing section never clears an existing
label, because silence is not a denial, but do not lean on that: state the fact.
Only generated bot pull requests are exempt.

## Labels

Do not apply labels. Both are applied by the bot above: the type label (`feat`,
`fix`, `docs`, `test`, `perf`, `refactor`, `chore`, `ci`) from the PR title, and
`agent-authored` from the box. Retitling moves the type label, and a title the
regex cannot read leaves the PR unlabelled, which is the signal to fix the title.
`bug` and `enhancement` belong to issues.

## Final response

Return PR URL, branch, commit summary, provenance declared, and validation
evidence.
The PR stays a draft.
