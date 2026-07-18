# Public datasets

This directory is the canonical home for versioned public task data:

- `dev/<wave>/manifest.jsonl` for public harness and prompt-development tasks.
- `train/<release>/manifest.jsonl` plus cleared tests, solutions, traces, and
  explanations released for model training.
- `retired/<wave>/` for embargo-cleared evaluation waves before they are folded
  into a training release.

The first concrete release is [`train/user-apps-v1`](./train/user-apps-v1). It
contains nineteen standalone user-facing application tasks across TSRX, core
Octane, Zustand, Hook Form, i18next, and TanStack Query. Each task ships a
prompt, starter application, behavioral grader, and public reference answer.

Each manifest file contains exactly one benchmark version, split, context mode,
and execution mode. Related task families never cross active candidate splits;
run `validateNoFamilyLeakage()` over the complete partition before writing the
per-split files. Use `parsePublicTaskManifestJsonl()` for train and dev files. It
rejects the active held-out `test` split and validates collection-level
comparability invariants.

When a test wave is retired and its embargo clears, copy its original immutable
manifest to `retired/<wave>/manifest.jsonl` and validate it with
`parseRetiredTaskManifestJsonl()`. Do not rewrite its split or task fields: that
would change the historical task-set digest.

Do not create `heldout`, `private`, `gold`, or `hidden` directories here. Active
evaluation material belongs in access-controlled grader storage, never in Git
history.
