# Compiled fragment and text mount work

This production client gate compiles one `.tsrx` source and mounts 256 keyed
three-root rows. Each row has a dynamic only-child label, a retained input, and
two dynamic sibling text holes around a static element. It records top-level
DOM API calls in happy-dom; internal happy-dom calls made *by* an instrumented
method are excluded. The single-root 256-row list, unrelated visible update,
keyed reverse, empty text, SVG/MathML content, native input value/focus, strict
DOM survivor identity, and unmount are semantic controls.

```bash
node benchmarks/bench.mjs --ratios dom-template-mount
BENCH_JSON=/private/tmp/dom-template-mount.json node benchmarks/dom-template-mount/run.mjs

# Compare frozen source against current source using one fixture and runner:
OCTANE_DOM_SOURCE_ROOT=/absolute/frozen/source \
OCTANE_DOM_DEPS_ROOT=/absolute/checkout/with/dependencies \
BENCH_BUNDLE_PATH=/private/tmp/dom-template-base.mjs \
BENCH_JSON=/private/tmp/dom-template-base.json \
node benchmarks/dom-template-mount/run.mjs

OCTANE_DOM_DEPS_ROOT=/absolute/checkout/with/dependencies \
BENCH_BUNDLE_PATH=/private/tmp/dom-template-candidate.mjs \
BENCH_JSON=/private/tmp/dom-template-candidate.json \
node benchmarks/dom-template-mount/run.mjs

# An optional actual-Chromium correctness gate for each production bundle:
node benchmarks/dom-template-mount/browser-work.mjs /private/tmp/dom-template-base.mjs
node benchmarks/dom-template-mount/browser-work.mjs /private/tmp/dom-template-candidate.mjs
```

The browser gate registers a custom element, verifies that its constructor
sees completed static/dynamic text, prepends its own Text node, retains both
text nodes through a later update, and that each `connectedCallback` observes
siblings arriving in authored order, mounts into an iframe document and checks
adopted `ownerDocument`, then hydrates two existing server-shaped roots without
replacing either root or its text node. An empty text update retains that
adopted node. This is needed because native
`insertBefore(fragment, anchor)` has a different custom-element connection
order than successive per-node insertion: **both** callbacks see **both**
siblings. The runtime retains the previous per-node path for parsed templates
containing custom-element names or customized built-ins (`is`). The compiler
also leaves custom-element and `<template>` only-child text templates empty:
their clone/child semantics cannot assume an inert parser text placeholder.
Only compiled native hosts with a seeded placeholder opt into Text reuse;
unseeded callers retain the original append contract.

At the frozen `58da3448b` baseline, the three-root mount made 1,794
`insertBefore`, zero `replaceChild`, and 256 label `createTextNode` calls. The
candidate makes 770 `insertBefore`, 512 `replaceChild` for the two sibling text
holes per row, and zero label `createTextNode` calls. It inserts 256 native
fragments. A new parsed template pays its three one-time child moves to build
the cached fragment; subsequent clones reuse that shape. The flat control
keeps 258 `insertBefore` while its 256 text labels also reuse cloned text.
Keyed reverse remains at 1,294 `insertBefore`; an unrelated update performs
zero. The ratio guards protect these bounded work counts along with the
semantic checks. Neither call count nor happy-dom establishes a browser latency,
paint, layout, GC, or application-wide speedup.

The compiled fixture's minified/gzip bytes and complete production bundle
bytes are recorded separately in the JSON result. With identical fixture and
entry hashes, minified fixture output was 4,341/1,503 gzip bytes at the frozen
baseline and 4,358/1,512 at the candidate. Complete bundle bytes were
550,874/119,743 gzip and 553,271/120,411 respectively. The candidate bundle
includes concurrent DOM attribute/event changes in the shared branch, so that
bundle difference cannot be attributed to these two template changes.
Real browser hydration
checks the direct two-root case; the core dev/prod regression also covers
keyed-row SSR adoption and preservation of the focused input. MathML namespace
is asserted in that regression; happy-dom's foreign-content emulation is
weaker, so this runner checks MathML text only. Native MutationObserver record
grouping can differ for ordinary fragment insertion (one batch versus several
per-node records), a DOM-operation detail outside this work gate's visible
DOM/identity contract.
