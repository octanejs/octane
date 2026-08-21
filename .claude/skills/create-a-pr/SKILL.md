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
3. For a new task, fetch the remote default branch and create a dedicated new
   worktree and non-default branch from it. For an existing pull request, use
   its already-dedicated worktree.
4. Verify the task worktree is not the primary checkout and its current branch
   is neither `main` nor `master`.
5. Confirm no unrelated local changes are included.

The primary checkout and local default branches are read-only. Never implement,
install dependencies, generate artifacts, test with commands that write files,
stage, or commit there. Preserve any state already present and move to the task
worktree before doing work.

## Branch and implementation hygiene

- Branch names: `fix/<short-topic>`, `feat/<short-topic>`, `docs/<short-topic>`, or `test/<short-topic>`.
- Keep commits focused.
- Add changesets for user-facing package changes; skip docs-only/test-only/internal tooling.
- If changing RuleSync source, edit `.rulesync/rules/*` or
  `.rulesync/skills/*` and run `pnpm rules:generate`.

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

## Preserve managed sections when updating an existing PR

The template above is for creating a new pull request. Before editing an
existing pull request body, fetch its current body with `gh pr view` and merge
the desired changes into that body. Never replace it from a newly generated
template.

Treat paired bot-managed HTML comment regions as opaque and preserve them
byte-for-byte. In particular, Cursor Bugbot owns this region:

```md
<!-- CURSOR_SUMMARY -->
...
<!-- /CURSOR_SUMMARY -->
```

Refetch the body immediately before writing because a bot can update it after a
commit is pushed. After `gh pr edit`, fetch it again and verify that every
managed region remains. If an edit races with a bot and removes one, recover the
latest region from the pull request's edit history and restore it before ending
the task. Adding or checking provenance is never a reason to discard an
existing summary, description, comment region, or maintainer-authored text.

## Create PR with GitHub CLI

Immediately before committing and pushing, synchronize the repository and
review the resulting diff. Include every relevant generated change in the
commit:

```bash
git branch --show-current
pnpm sync
git status --short
git add <files>
git commit -m "<type>: <summary>"
git push -u origin <branch>
gh pr create --draft --body-file <file>
```

Write the body to a temp file and pass it explicitly. Do not use `--fill`: it
builds the body from your commits and drops the template, which would falsely
classify an agent-produced diff as human-authored.

Apply no labels, and never pass `--label`. Your token has no rights to label at
all when the PR comes from a fork, and `.github/workflows/label-pr.yml` applies
both labels as a bot, which does.

## Draft and readiness gates

Open every PR as a draft. Nothing has run against the pushed diff yet, and the
draft state is what says so. A request to create a PR through completion
authorizes the agent to mark it ready after every non-CI gate below and all
relevant local validation pass, unless the user explicitly asks to leave it as
a draft. The required-check gate has this bootstrap exception: when Actions has
produced no required checks for the current head because the PR is still a
draft, the first transition to ready is allowed after every non-CI gate passes.
That transition starts CI; it is not evidence that CI passed.

- every required and relevant CI check is terminal and successful;
- every actionable review comment and review thread is resolved on the current head;
- no reviewer or bot review is still in progress or expected for an older head;
- the head contains the live base branch, not merely the base SHA cached when the PR opened;
- GitHub reports the PR mergeable with no conflict or branch-currency blocker; and
- the final `pnpm sync` and relevant local validation leave the worktree clean.

These are independent gates. Green checks do not prove that review feedback is
resolved, and resolved feedback does not prove that the branch still merges.
After the bootstrap transition, keep the PR ready while required checks run. Do
not describe the work as done, complete, fully ready, or merge-ready until every
required and relevant CI check for the current pushed head is terminal and
successful; if a check fails, address it, push the fix, and restart the gates.
Re-check mergeability and the live base after the last push and immediately
before `gh pr ready`. If the base moved, incorporate it without rewriting a
published branch, rerun sync and validation, push, and start the gates again.

Monitor required and relevant CI checks after the PR is ready and continue
through failures until the current pushed head is green. Use bounded polling
intervals so status updates can still be shared. Repository CI intentionally
skips every job while the pull request is a draft and starts on the
`ready_for_review` event, so a draft-only skipped result is not green. Cursor
Bugbot still reviews every pull request, including drafts, outside Actions;
Vercel may also report separately.

## Declare provenance in the PR body

Keep the provenance section from `.github/pull_request_template.md` in the body
you write, and tick the box, because an agent produced the diff:

```md
## Provenance

- [x] An agent produced this diff (`agent-authored`)
```

Leaving the box clear or omitting the section is a positive claim that a human
wrote the diff, so neither is safe when an agent produced it. An agent commits
under a human's credentials, which is why nothing else in the PR can tell the
two apart.

`.github/workflows/label-pr.yml` applies `agent-authored` only for a checked box.
An empty box or missing section is human-authored, removes a stale agent label,
and leaves the label check successful. The workflow runs as a bot with the
repository's own token, so this works identically from a fork and needs nothing
from a maintainer.

## Labels

Do not apply labels. Both are applied by the bot above: the type label (`feat`,
`fix`, `docs`, `test`, `perf`, `refactor`, `chore`, `ci`) from the PR title, with
the type-prefixed head branch as a fallback, and `agent-authored` from the box.
Retitling to another supported type moves the type label. A title and branch the
parser cannot read leave the PR unlabelled. `bug` and `enhancement` belong to
issues.

## Final response

Return PR URL, branch, commit summary, provenance declared, and validation
evidence, including required and relevant CI results for the current pushed
head and the PR's final draft/readiness state. Do not say the work is done or
complete unless required and relevant CI is green.
