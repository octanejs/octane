# Static component inlining

Six production TSrX applications render 256 keyed rows containing a static
component chain at depths 1, 3, and 5. Each depth has private same-module
components and an imported-component control. Every level contributes a `div`;
the leaf contributes a `span` and `em`. An uncontrolled input sits outside the
chain, and the parent updates its `data-tick` attribute. Component bodies contain
no diagnostic callbacks or hooks.

Build each checkout in a separate Node process using the same installed toolchain
(Node 22.22.3). `--source-root` selects both the compiler and every Octane runtime
entry. The build rejects foreign Octane runtime modules, records source hashes,
and saves the transformed modules and complete production JavaScript raw/gzip
sizes. All six cases share one artifact; its size is not a per-case capability
measurement. Output directories must be new and should be outside the checkout.

```sh
node benchmarks/component-inlining/build.mjs --source-root /path/to/base --mode work --out /tmp/inlining-base-work
node benchmarks/component-inlining/build.mjs --source-root . --mode work --out /tmp/inlining-head-work
node benchmarks/component-inlining/run.mjs --mode work --base /tmp/inlining-base-work --candidate /tmp/inlining-head-work --out /tmp/inlining-work

node benchmarks/component-inlining/build.mjs --source-root /path/to/base --mode timing --out /tmp/inlining-base-timing
node benchmarks/component-inlining/build.mjs --source-root . --mode timing --out /tmp/inlining-head-timing
node benchmarks/component-inlining/run.mjs --mode timing --base /tmp/inlining-base-timing --candidate /tmp/inlining-head-timing --out /tmp/inlining-timing
```

The work run uses readable production output, 32 rows and native DOM wrappers in
fresh realms. It records clone/import/insertion/removal calls around each operation
and verifies output, nesting, every element's identity through the ancestor
update, an edited input draft, and empty teardown. Compile-time helper call counts
in the build manifest are a separate output census, not executed call counts.
Work counts are diagnostics, not latency evidence. `--candidate` can be omitted
for a baseline-only work run.

The timing run uses minified production output without DOM wrappers or coverage.
It takes 24 fixed fresh-realm pairs per case, rotating case order and alternating
baseline/candidate order. Each realm records its first mount after module loading,
checks identity and input state, then runs mount/update/unmount in that order.
Each operation has ten four-repetition warm batches. Retained batches have 64
mounts, 2048 updates, and 256 unmounts. For mount/unmount, the opposite operation
occurs outside each timed window. All semantic checks occur outside the windows.
Update identity and input state are checked again after the retained batch.

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
