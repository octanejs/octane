# Protocol examples

These JSONL files show one public development task moving through the evaluation
protocol:

- [`manifest.jsonl`](./manifest.jsonl) declares an integration-authoring task.
- [`run.jsonl`](./run.jsonl) freezes one model/harness configuration and binds it
  to the canonical task-set digest.
- [`prediction.jsonl`](./prediction.jsonl) submits one model-generated patch.
- [`result.jsonl`](./result.jsonl) records deterministic grader outcomes and
  resource usage.
- [`prompts/`](./prompts) contains the public prompt artifacts identified by the
  run manifest.

Each JSONL file contains exactly one JSON object per line. The task is
illustrative, not an evaluation release: its image and grader hashes are
syntactically valid placeholder digests, and no private grader is associated
with them.

Real development and retired manifests may be committed under `datasets/`. An
active held-out manifest contains its prompt, so it stays private with hidden
tests and solutions; only non-revealing wave metadata and digests are public.
