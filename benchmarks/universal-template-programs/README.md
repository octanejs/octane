# Universal template programs

This Node-only benchmark compiles one component through the public compiler
and renders it with an object driver that accepts prepared template programs
and runs. The component renders 1,000 keyed `@for` rows. Each row carries its
click handler on the row element and one child:

```tsx
<row id={row.id} on={row.on ? 'yes' : 'no'} onPress={() => props.select(row.id)}>
	<label text={row.label} />
</row>
```

The `styled` variant also passes `style={{ opacity: ... }}` and runs with the
`templateProgramStructuredValues` driver capability. Each sample mounts a
fresh root, then times 20 updates of one kind:

- `toggle`: one row's item changes;
- `replace`: every row's item changes, so no row can keep its memo.

`mount` rows report the mount time and the serialized size of the mount batch
the driver receives (`JSON.stringify(batch.commands)`); update rows report the
average serialized batch per update. Every run checks the final row props and
labels, dispatches one row's handler, and checks that unmount releases every
host. On this checkout every row must mount from a prepared program, never a
generic per-row template.

```bash
node benchmarks/universal-template-programs/run.mjs 7
node benchmarks/bench.mjs --quick universal-template-programs
```

To compare against another checkout, set `UNIVERSAL_BASE_ROOT` to its root. Its
compiler and runtime sources then run in the same process, sampled in
alternating AB/BA pairs, and the table adds the paired head/base ratio.
Dependencies always come from this checkout. Run with `node --jitless` to
measure an interpreter-only engine.

```bash
git worktree add --detach ../octane-main origin/main
UNIVERSAL_BASE_ROOT=../octane-main node benchmarks/universal-template-programs/run.mjs 15
```

Results describe the Node object driver, not native-device latency or
transport cost.
