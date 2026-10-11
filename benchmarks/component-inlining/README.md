# Static component inlining

Six production TSrX applications render 256 keyed rows containing a static
component chain at depths 1, 3, and 5. Each depth has private same-module
components and an imported-component control. Every level contributes a `div`;
the leaf contributes a `span` and `em`. An uncontrolled input sits outside the
chain, and the parent updates its `data-tick` attribute. Component bodies contain
no diagnostic callbacks or hooks.

`--scenario dynamic` generates a separate six-case cohort with a primitive
string forwarded through every level. The authored entry is
``<C0 text={`${props.text}`} />``, retaining outer string coercion. Both compiler
variants receive the same component tags; the benchmark does not substitute
authored function calls or hand-flattened markup. The default remains `static`,
with its original authored fixtures and ancestor-update operation.

`--scenario exported-entry` uses the same static six-case shape, with local
`C0` exported and its descendants private. Imported descendants remain controls;
depth 1 has no descendant to inline. It uses the unchanged static client,
operations, identity/draft checks and fixed protocol. The existing static,
dynamic and delegation authored fixtures remain byte-identical.

`--scenario delegation` adds eight cases with 0, 1, 3, or 5 private same-module
forwarding wrappers and matching imported controls. Here depth counts wrappers,
not host layers: each wrapper is exactly `<Next {...props} />` and contributes
no DOM. A separate terminal Child owns `useState(0)`, a native increment button,
the forwarded text, and a tail element. The zero-wrapper cases call Child
directly. App supplies fresh named text/row-id props, and the uncontrolled input
remains outside the chain. No diagnostic callbacks or additional effects run in
component setup. The existing static and dynamic authored fixtures are unchanged.

Build each checkout in a separate Node process using the same installed toolchain
(Node 22.22.3). `--source-root` selects both the compiler and every Octane runtime
entry. The build rejects foreign Octane runtime modules, records source hashes,
and saves the transformed modules and complete production JavaScript raw/gzip
sizes. Each cohort shares one artifact; its size is not a per-case capability
measurement. Output directories must be new and should be outside the checkout.

`--scenario exported-example` is a separate build-only probe of this exact
source, including its unused import:

```tsrx
import { useState } from 'octane'; function Child({ text }) @{ <div>{text}</div> } export default function App() @{ <Child text="123" /> }
```

It builds only that module and a minimal public `createRoot(...).render(App)`
entry, without the cohort registry or benchmark client. Use `--mode timing` to
select the existing production minifier and report complete JavaScript raw/gzip
bytes; this option builds an artifact and does not run timing. `run.mjs` rejects
the example scenario. Compare both source roots with identical build options.

```sh
node benchmarks/component-inlining/build.mjs --source-root /path/to/base --mode work --out /tmp/inlining-base-work
node benchmarks/component-inlining/build.mjs --source-root . --mode work --out /tmp/inlining-head-work
node benchmarks/component-inlining/run.mjs --mode work --base /tmp/inlining-base-work --candidate /tmp/inlining-head-work --out /tmp/inlining-work

node benchmarks/component-inlining/build.mjs --source-root /path/to/base --mode timing --out /tmp/inlining-base-timing
node benchmarks/component-inlining/build.mjs --source-root . --mode timing --out /tmp/inlining-head-timing
node benchmarks/component-inlining/run.mjs --mode timing --base /tmp/inlining-base-timing --candidate /tmp/inlining-head-timing --out /tmp/inlining-timing
```

For the dynamic cohort, add `--scenario dynamic` to each build command and use
separate output paths. The runner reads the scenario from the manifests and
rejects mixed cohorts. `changedLeaf` changes the string and ancestor tick;
`equalProps` changes only the ancestor tick. It means equal child input values,
not retained props-object identity: the driver creates fresh App props and the
authored C0 call still receives ordinary component props. Both phases check the expected
current text, every retained Element and Text node, the edited input draft, and
empty teardown. They remain separate result rows. These fixtures exercise only
primitive strings; getters, coercive objects, hooks, suspension and native signals
require their own semantic controls.

For the delegation cohort, build with `--scenario delegation`. Parent changed-
and equal-input operations update all rows as above. `childSelfUpdate` instead
clicks the first row's native button and flushes synchronously: one row changes
state, while every other row retains zero. The target button is selected outside
retained timing windows. Public checks retain all Element and Text identities,
the edited input, and nonzero child state across subsequent parent updates.
An additional untimed control clicks a fresh child, checks its update has not
committed, unmounts before flushing, then verifies an empty host and no subsequent
write to the detached button. The detached value is sampled after public unmount;
the check does not require unmount itself to avoid flushing. This covers
queued-owner retirement, not effect cleanup.

The work run uses readable production output, 32 rows and native DOM wrappers in
fresh realms. It records clone/import/insertion/removal calls around each operation
and verifies output, nesting, every element's identity through the ancestor
update, an edited input draft, and empty teardown. Compile-time helper call counts
in the build manifest are a separate output census, not executed call counts.
Work counts are diagnostics, not latency evidence. `--candidate` can be omitted
for a baseline-only work run.

For exported entries, first compare the readable output and native work counts
for all six cases, then the complete minified bundles. Confirm eligible local
depths 3/5 changed and depth 1/imported controls retained their output before
running latency. Keep this cohort separate from the original-to-final
delegation comparison; neither its samples nor earlier ratios are combined.

The timing run uses minified production output without DOM wrappers or coverage.
It takes 24 fixed fresh-realm pairs per case, rotating case order and alternating
baseline/candidate order. Each realm records its first mount after module loading,
checks identity and input state, then runs mount/update/unmount in that order.
Each operation has ten four-repetition warm batches. Retained batches have 64
mounts, 2048 updates, and 256 unmounts. For mount/unmount, the opposite operation
occurs outside each timed window. All semantic checks occur outside the windows.
Update identity and input state are checked again after the retained batch.
The dynamic cohort instead uses 64 changed-leaf updates and 2048 equal-prop
updates, with the same mount/unmount counts, warm batches, pairs and cold sample.
All checks stay outside timing windows. Run both checkouts with the updated
shared harness; do not pool these samples with older static benchmark receipts.

The delegation cohort uses the same fixed protocol, adding 2048 one-row
`childSelfUpdate` operations after the parent changed/equal phases. It has eight
cases, including the direct-child controls. Its extra parent/state-retention and
queued-retirement checks remain outside counters and timing windows. No latency
measurement is authorized merely by preparing this scenario; coordinate the
exclusive timing window after matched production builds and semantic validation.

Raw windows and repetitions are retained. Candidate/base medians and paired
bootstrap 95% intervals use the shared statistics helper. Positive milliseconds
per operation are scaled by 1e6 before that helper to avoid its numeric floor;
units cancel and this adds no timer precision. A zero-duration sample stops the
run instead of being discarded. First-mount and warmed results stay separate.

Both modes use the shared benchmark lock and close only their own browser and
ephemeral servers. `--browser /path/to/chrome` selects a browser explicitly;
otherwise the installed Playwright Chromium is used. The receipt records its
version and explicit executable override (or Playwright default selection), and
verifies the served JavaScript bytes. These measurements cover synchronous
JavaScript/DOM commits, without forced layout, paint waits, network latency,
explicit garbage collection, or hydration. They do not establish
whole-app performance or cross-browser results.

Compiler throughput uses the existing component-graph corpus and runner; no new
synthetic compiler workload is needed. Run the same command in balanced separate
processes for each source root, retaining all output and raw samples:

```sh
OCTANE_GRAPH_ROOT=/path/to/base BENCH_JSON=/tmp/inlining-compiler-base.json node benchmarks/tsrx-component-graph/run.mjs 8 --raw-samples > /tmp/inlining-compiler-base.log 2>&1
OCTANE_GRAPH_ROOT=/path/to/head BENCH_JSON=/tmp/inlining-compiler-head.json node benchmarks/tsrx-component-graph/run.mjs 8 --raw-samples > /tmp/inlining-compiler-head.log 2>&1
```

That corpus covers opaque imports and large conditional component graphs. It is
a compiler-cost control, not a measure of runtime inlining benefit. Coordinate
exclusive timing before running either timing protocol; do not mix concurrent
builds, tests, compiler samples, or other benchmarks into it.

Two untimed compiler-output controls check bounded expansion separately:

```sh
node benchmarks/component-inlining/limits.mjs --base /path/to/base --candidate . --out /tmp/inlining-limits
```

One puts a 9000-code-unit literal Leaf under eight private parents with distinct
IDs. The other repeats a 200-code-unit Leaf 64 times in one parent: shallow calls
and fewer than 256 expanded nodes, but more than 8192 text code units. The shared
component-graph output analyzer reads template literals from the compiled AST.
The controls retain authored and compiled modules and report total template
bytes, exact payload preservation, and whole-module equality where observed.
They require one shared payload copy and no template-byte amplification versus
the baseline. This is output-size evidence, not browser or compiler latency.
