# Fixed primitive child bindings

`dom-binding-fixed-props.mjs` runs a public child-program comparison outside the
fixed codegen corpus. Both targets use the same imported presentation, compiler
options, and live title, class, event, and ref channels. The generic control
retains only ordered caller keys; the candidate also carries caller-authored
primitive values in the extraction request.

The child module and complete production runtime bundle have separate raw,
minified, and gzip ratios in `benchmarks/baselines/ratios.json`. The child target
must remove at least 5% in each metric; the complete bundle must not grow.
Adopted and mounted runs must produce identical content and live updates,
preserve the adopted button, deliver native clicks, and release subscriptions
and listeners on disposal. Reports include semantic and source hashes plus the
Node and esbuild versions.

```sh
node benchmarks/bench.mjs --quick --ratios dom-binding-fixed-props
```

Only explicit strings, booleans, null, finite non-negative-zero numbers, and
pure `void` literals carry proofs. Missing fields, objects, callbacks, and
uncertain reads remain live. Destructured defaults apply only to an explicitly
fixed `undefined`; they are not inferred for absent fields. Fixed values are
validated by the generated preparation before specialized projections run.
Non-finite literal defaults remain live. Native callback bodies retain their
authored assignments and execution order. Generic plans reuse an identity
specializer without allocating proof maps or closures.
Authored conditional sites, arm indices, range borrowing, SSR output, and
hydration takeover remain unchanged; inactive templates are omitted from the
binding descriptor. This measures generated/bundled bytes, not load latency or
rendering speed.
