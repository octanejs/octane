# Persistent descriptor host props

The `hostComponent` update path can avoid publishing a property when the live
target already contains its incoming value. The current implementation checks:

- Delegated events against the live handler slot, after development validation.
- String `class`/`className` values against the live class attribute.
- String `id`, `title`, `role`, `for`/`htmlFor`, `data-*`, and `aria-*` values
  against their live attributes.

The guard runs only on updates outside hydration and excludes custom elements.
Development hosts with source diagnostics retain attribute validation as well.
Mount, hydration, custom-element callbacks, controlled properties, style, raw
HTML, mutable class values, and other attribute coercions retain their existing
setters. No cache record or additional host-state field is created.

## Why the comparison uses the live target

Same-named props alone cannot establish the current value. A removed alias can
clear another retained alias, changing property order changes the winner, and
foreign DOM code can change an attribute or input value. Mutable arrays and
coercion objects can change without changing identity. Reading the previous
props object can also invoke an old accessor again.

The live comparison handles each writer in its existing order. Changed aliases
still execute their setters, while repeated winners can skip their write and
rollback record. Attribute absence remains distinct from an empty string.
Controlled `value`/`checked` continue to reassert after native edits. The retained
paths preserve ref lifetime, mount-only autofocus, style removal, mutable raw
HTML, and development event diagnostics.

## Measurements

Same machine, Node 24.20.0, happy-dom, production bundles, 128 updates per phase. The host
has 24 `data-*` attributes, `id`, `title`, `role`, a class, and one native click
handler. The clean and instrumented bundles must produce equal DOM, event
results, host identity, focus, and teardown results.

| Phase | Attribute setter calls | Class setter calls | Event publications | Attribute reads |
| --- | ---: | ---: | ---: | ---: |
| Same values, baseline | 3,456 | 128 | 128 | 4,224 |
| Same values, candidate | 0 | 0 | 0 | 3,840 |
| Changed title/class, baseline | 3,456 | 128 | 128 | 4,224 |
| Changed title/class, candidate | 128 | 128 | 0 | 4,224 |
| Foreign title/class/data edits, baseline | 3,456 | 128 | 128 | 4,352 |
| Foreign title/class/data edits, candidate | 256 | 128 | 0 | 4,480 |

The isolated clean runtime bundle changes from 160,541 to 160,852 minified bytes
and from 51,905 to 52,027 gzip bytes: +311 minified / +122 gzip. These figures
compare the frozen `3c1cc55d8` runtime with only the updated `applyHostProps` body,
excluding the other descriptor-renderer edits. Counters describe reached source work and DOM method
calls; they are not wall-clock or heap-allocation measurements. A mismatching
attribute may incur both the comparison read and its rollback snapshot read.

Reproduce with the same installed dependencies:

```sh
git show 3c1cc55d8:packages/octane/src/runtime.ts > /tmp/descriptor-props-base.ts
BENCH_JSON=/tmp/props-base.json node benchmarks/descriptor-renderer/props.mjs /tmp/descriptor-props-base.ts
BENCH_JSON=/tmp/props-current.json node benchmarks/descriptor-renderer/props.mjs
```

## Correctness evidence

`descriptor-host-props.test.ts` exercises class/label aliases, native event
aliases, live DOM and controlled value edits, mutable class/coercion/raw-HTML
values, getter reads, focus, ref lifetime, style removal, custom-element
attribute callbacks, and rollback after a later suspension.

A deliberately broken build that skipped equal previous prop identities failed
eight of the original twelve development/production cases. The failures
preserved the wrong alias winner, left foreign DOM edits visible, and froze
mutable values. The live comparison passes those cases and the existing
host-component and prop-removal suites.
