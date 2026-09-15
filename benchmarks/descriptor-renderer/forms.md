# Form source resolution and select projection

This part of the descriptor-renderer audit covers the two form entries in #981.
The setters are shared by compiled templates, spreads, descriptors, and native
controlled-event restoration.

## Preserved behavior

- Form source precedence is resolved before applying controls. Input defaults
  coerce before controlled values; select `multiple` precedes value projection.
- JSX spread getters are evaluated once at their authored position, including
  enumerable symbol getters. The compatibility helper still ignores inherited
  and non-enumerable fields and honors an explicit `undefined` final writer.
- Case-sensitive form prop names remain independent of case-insensitive native
  attributes. The final raw writer Map, before DOM alias normalization, supplies
  `value`, `defaultValue`, `checked`, `defaultChecked`, and `multiple`.
- A controlled select projects immediately and again after children finish
  rendering. The second pass handles options that are created, removed, or
  reordered after the value binding. Hydration adopts pre-hydration user edits.
- The complete option journaling pass stays ahead of selection writes. Setting
  one option can implicitly deselect another, so recording siblings after a
  write would lose their accepted state.
- Native input/select restoration, default selection on form reset, option
  identity, held screens, and retry behavior remain unchanged.

## Changes

`setHostPropSources` already holds each final raw prop writer. It now passes
those values to a private fixed-argument application helper instead of scanning
the original sources again. `setFormControlSources` remains a compatible resolver
for other callers. Its direct source dispatch and spread assignments no longer
allocate an `assign` closure. The spread guards are retained: the original issue
count of five checks is outdated; this helper performs four per input spread,
three per select spread, and two per textarea spread.

`projectSelectValue` loads each current option once inside its projection loop.
Both projection passes and the full rollback prepass remain. No option cache or
additional retained state is introduced.

## Deterministic work evidence

```sh
node benchmarks/descriptor-renderer/forms.mjs
# A frozen runtime may be supplied for the same source, compiler, and dependencies:
BENCH_JSON=/tmp/forms-baseline.json node benchmarks/descriptor-renderer/forms.mjs /tmp/runtime-baseline.ts
```

Recorded using Node v24.20.0 on macOS arm64. The baseline runtime is commit
`3c1cc55d8`; the candidate uses the changes described above. Each row contains
an input, textarea, checkbox, and eight-option multiple select. The compiled
spread and direct controls have 128 rows; the compatibility helper has one row.
Both clean and instrumented production bundles verify final form values,
selection, host identity, rejected native input restoration, and empty teardown.

| Work per update | Baseline | Candidate |
| --- | ---: | ---: |
| Spread rows: compatibility resolver calls | 512 | 0 |
| Spread rows: reached assign-closure sites | 512 | 0 |
| Spread rows: own-enumerable checks | 1,664 | 0 |
| Spread rows: raw writer lookups for form values | 0 | 2,560 |
| Spread rows: option indexing, changed selection | 5,632 | 3,072 |
| Spread rows: option indexing, unchanged selection | 5,120 | 3,072 |
| Spread rows: projections / control applications | 256 / 512 | 256 / 512 |
| Direct rows: resolver calls / reached closure sites | 128 / 128 | 0 / 0 |
| Direct rows: own-enumerable checks | 0 | 0 |
| Direct rows: raw writer lookups for form values | 0 | 640 |
| Direct rows: option indexing, changed / unchanged | 5,632 / 5,120 | 3,072 / 3,072 |
| Direct rows: projections / control applications | 256 / 128 | 256 / 128 |
| Compatibility row: resolver calls / enumerable checks | 4 / 13 | 4 / 13 |
| Compatibility row: reached closure sites | 4 | 0 |
| Compatibility row: raw writer lookups for form values | 0 | 0 |
| Compatibility row: option indexing, changed / unchanged | 44 / 40 | 24 / 24 |
| Compatibility row: projections / control applications | 2 / 4 | 2 / 4 |

The direct select has multiple interacting form bindings, so the compiler also
uses host source resolution for it. Direct text/checkbox bindings continue using
their ordinary setters; the application count only includes aggregated calls.
The extraction replaces source scanning with five lookups in an existing Map
per aggregated host. The counter reports that transferred work explicitly; the
removed checks and closures alone do not establish a throughput improvement.

The observer uses the actual parsed runtime to count reached closure expressions,
own-enumerable checks, and numeric option accesses. It records runtime/source
hashes, clean bundle bytes, and semantic hashes in `BENCH_JSON`. These are source
work counts, not retained-heap measurements or a browser throughput claim.
The measured forms-only bundle changed from 176,189 to 176,227 minified bytes
(+38), and 56,715 to 56,719 gzip bytes (+4); later changes to shared runtime code
can change the full benchmark bundle independently of these form paths.

## Correctness and adversarial checks

`packages/octane/tests/descriptor-form-controls.test.ts` covers compatibility
sources, spread/coercion order, case aliases, late options, native selection
restoration, single/multiple held updates, retries, form reset, and hydration.
The adjacent controlled-select and host-source aggregation suites also pass.

A rejected implementation read the DOM-normalized prop object instead of the raw
writer Map. The new case-alias regression failed because `VALUE="attribute"`
replaced the recognized controlled `value="accepted"`; using the existing raw
writer Map fixes this without another scan or snapshot.

Isolated test-loader mutations demonstrate that the behavioral tests fail when
own-enumerable guards accept hidden properties, when the pre-projection option
journal is removed, or when the post-children projection is dropped. The authored
runtime is not changed by these deliberately broken test runs.
