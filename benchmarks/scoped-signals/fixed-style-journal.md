# Fixed-key style rollback snapshots

This isolates issue #1130 §2.6. Updating six changed declarations in an inline
style object used to snapshot the host's entire live `style` attribute six times.
The equivalent opaque style object snapshots it once. Both consumers still write
the same six CSS declarations.

`setStyleProperty` now reuses the immediately preceding snapshot for the same
host and attribute within the current journal checkpoint. It may skip one
four-slot `JOURNAL_BAG` record only when that record belongs to the current
binding bag. Intervening writes, other bags, other hosts, and earlier checkpoints
retain their own snapshots. Binding bags are still journaled. There is no new
map, retained field, allocation, or scan.

## Reproduce the operation guard

```sh
node --test benchmarks/scoped-signals/fixed-style-journal.test.mjs
node benchmarks/scoped-signals/fixed-style-journal.mjs
```

The guard is included in `pnpm run ci:workflow:test`. It compiles the same public
TSRX consumer in development and production with frozen ASTs and location
assertions, then bundles against the selected worktree's source. The scalar and
opaque consumers must produce matching CSS, preserve host and uncontrolled input
identity and draft values, and release their DOM on unmount.

For a matched baseline, save `packages/octane/src/runtime.ts` from the base
commit and pass that path as the optional argument to the second command.
`buildFixedStyleJournal` and `measureFixedStyleJournal` also accept `{ dev,
runtimePath }` for paired diagnostics.

## Matched results

Base: `0b48d5d0723b669eee1a903fcefe99f2a88de4f9`. Both variants use its compiler,
packages, lockfile, and frozen consumer input. Only the client runtime differs.
Toolchain: Node 24.19.0, esbuild 0.28.1, Happy DOM 20.11.2, and Chromium
149.0.7827.55. The lockfile SHA-256 is
`af0457e80aa081883f866fdda8aae261145eac1dd08ca9a592a0b24b3984004b`.

| Measurement | Base | Candidate |
| --- | ---: | ---: |
| Native Chromium whole-style snapshots, one fixed-key host | 6 | 1 |
| Native Chromium whole-style snapshots, opaque control | 1 | 1 |
| Native Chromium declaration writes, either consumer | 6 | 6 |
| Happy DOM style reads, 100 fixed-key hosts | 1,200 | 700 |
| Happy DOM style reads, 100 opaque hosts | 700 | 700 |

Development and production agree. Happy DOM's declaration setters each read the
attribute internally, adding 600 reads to both consumers; the guard compares the
two consumers so these reads cancel. The native probe confirms the actual
snapshot count without that extra implementation cost.

All eight native lanes (base/candidate × development/production × fixed/opaque)
preserve final CSS, host/input identity, a trusted-input draft, focus, caret, and
cleanup. Console warnings/errors and page errors were captured before navigation
and module evaluation; every lane's capture is empty. This is a source-selected
public-compiler/esbuild browser probe, not a Vite or Rspack build claim.

| Production closure | Base gzip | Candidate gzip | Delta |
| --- | ---: | ---: | ---: |
| Fixed/opaque operation consumer | 65,067 B | 65,152 B | +85 B |
| Generic public root | 60,895 B | 60,895 B | 0 B |
| Renderer-free signals engine | 14,508 B | 14,508 B | 0 B |
| Generic SSR | 17,843 B | 17,843 B | 0 B |
| Real native signal application | 82,378 B | 82,378 B | 0 B |
| Real native signals plus fixed-key scalar styles | 84,620 B | 84,695 B | +75 B |

The fixed/opaque consumer adds 123 raw bytes; its development bundle adds 122 raw
and 63 gzip bytes. Of the 15 public closure controls, 14 are byte- and
SHA-identical. Only the real native application that also uses fixed-key scalar
styles changes, by 123 raw and 75 gzip bytes. Engine, SSR, binding capabilities,
streamed bootstrap, compiled model-only signals, and pure native application
controls do not absorb new code. Both real application controls pass accepted
model/DOM updates, input/button identity, and cleanup on base and candidate.

This demonstrates fewer whole-style snapshot reads and journal attribute
records. It does not claim fewer declaration writes, a CPU improvement, generic
bundle recovery, or removal of prospective signal metadata.

## Correctness boundaries

The owning public tests cover abandoned root renders and live external CSS edits,
nested suspension/retry savepoints, coercion failure after partial writes to
separate hosts, reentrant coercion that updates another root, SSR DOM adoption
with an uncontrolled draft, and canceled native preparation. The final nearby
matrix passes 746 tests in 22 files; workflow checks pass 214 tests in 13 suites.
Scoped typecheck, scoped format, changeset validation, and `pnpm sync` pass.
Repository-wide test, typecheck, and format commands were not run locally.

Removing the host equality check fails four public cases; removing the attribute
name check fails eight. Both mutants were restored to the exact candidate bytes
before the final tests and measurements. The checkpoint comparison remains a
cheap defensive invariant. No public checkpoint-omission mutant failure was
established: component rendering adds a `JOURNAL_RENDER` barrier before entering
the authored body. It is not counted as mutation evidence.

## Source and input provenance

- Base runtime SHA-256:
  `5f1bea3fbc3be54af95063cf77aa008ca75de12ecdc73d2f837c5fee45c2c123`.
- Candidate runtime SHA-256:
  `1564db37bf2b4c389b267262fdbfe4371b5947126bceae21adacedc9dab1233d`.
- Fixed/opaque authored consumer SHA-256:
  `8409cd4d7f37f3f64a42cd45973b3a92956a66deb7be381e788b75794839c947`.
- Production compiled consumer SHA-256:
  `a1a725e33aebf061b9fa52b96c3701d01fe5824b8f0c0012c40dc8c1bb2711d5`.
- Development compiled consumer SHA-256:
  `98ae29a31b1ca4842fe2e1b4375814c0a4deacd2f00357ec2299a07453fba4a0`.

The consumer source and compiled output hashes match between base and candidate.
