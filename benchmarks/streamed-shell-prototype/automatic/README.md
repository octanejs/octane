# Generated immutable-shell experiment

This is a Vite-only experiment, not a public feature. The build configuration
explicitly selects one source file and assumes that its root hydrates exactly
once from the corresponding SSR document, with an immutable outer shell for that
root's lifetime. There is no authored directive. The plugin checks a very narrow
source shape and generates the client shell from it; it does not establish the
root-lifetime assumption or inspect an application's complete component graph.

The accepted module has imports and exactly one named exported zero-argument
template component, with no setup statements. It renders a fixed `<main>` or `<div>` with
literal text, an allowlist of ordinary HTML attributes, a restricted set of intrinsic HTML elements, and
one directly imported, self-closing component with no props or children. The
live component must be the only meaningful child of a `<div>` nested inside the root. Expressions,
events, refs, spreads, control flow, components elsewhere, unsafe HTML nesting,
scoped styles, other top-level statements, and unknown forms fall back to the
ordinary compilation. Only production builds are eligible. Watch builds are excluded because this experiment has no
cross-module proof invalidation. Static host element indices come from the authored tree;
the child needs no marker or author annotation. Imported CSS and side effects
remain in their original source order.

The generated shell adopts the existing root and invokes the live child using
Octane's private compiler ABI. It gets the invocation site from server compiler
output using the original source, the exact absolute filename, and the same
compiler root as this fixture's SSR build. Multiple or unavailable sites fall
back. The production candidate checks the resolved child module's compiled-code
fingerprint and compiler void-export metadata before using a void component
slot; missing or stale child proof falls back to normal Octane compilation. A
post-transform supplies a void-root proof only if the output exactly matches the
same canonical client compiler's result for the generated return-free function;
Octane's existing consumer independently verifies that output's fingerprint.
If the root proof is unavailable after the surrogate was generated, the generic
root remains and may be substantially larger. The generic build is a diagnostic
control that deliberately omits both proofs.

The contract does **not** cover client-only mount, root updates or rerenders,
remounts, navigation, DOM mismatch recovery, pending Suspense, streamed reveals,
or async signal ownership. A mismatched host path can throw. In particular,
the plugin is not suitable for normal production roots merely because its
syntax test passes. Unsupported syntax falls back at build time; there is no
runtime fallback or general code path included in the optimized bundle. The
prototype assumes other transforms do not change the server-side source,
compiler options, path, or the root's lifetime contract.

To build the same SSR page with baseline, generic and specialized clients:

```sh
node --test benchmarks/streamed-shell-prototype/automatic/plugin.test.mjs
node benchmarks/streamed-shell-prototype/automatic/scan.mjs
node benchmarks/streamed-shell-prototype/automatic/build.mjs --output-dir=/absolute/new-output
node benchmarks/streamed-shell-prototype/verify-jsdom.mjs --build-dir=/absolute/new-output
# Optional: use a div as the same synthetic fixture's root on server and client.
node benchmarks/streamed-shell-prototype/automatic/build.mjs --div-root --output-dir=/absolute/new-div-output
node benchmarks/streamed-shell-prototype/verify-jsdom.mjs --build-dir=/absolute/new-div-output
PLAYWRIGHT_EXECUTABLE_PATH=/absolute/approved/browser \
  node benchmarks/streamed-shell-prototype/verify-browser.mjs --build-dir=/absolute/new-output
```

The build fails if the baseline lacks or generated variants retain the static
template. It includes all statically and dynamically reachable JS, compresses
each physical file independently, and records CSS and HTML. Both candidates
use the same server HTML. The live child has state and an on-demand dependency;
the existing check verifies original node identity, focus, two updates, and
both shared and shell-only module-effect order. A child-descendant attribute
collision is present deliberately; navigation follows the derived host path.
The rejection suite also runs a separately built unsafe component and observes
its setup in emitted ESM, and changes a child after compilation to test stale
metadata fallback. A fresh client-mount control observes the ordinary component
mount successfully while the generated surrogate fails, demonstrating the
lifetime restriction. jsdom does not establish browser CSS or network behavior.

The comparison is a synthetic Vite library build. Sizes are compressed file
bytes, not transferred bytes, runtime timing, or application savings; it
contains no fallback code, generated route bootstrap, or streaming protocol.
Compiler time and memory are not measured. The exact whitelist matched zero of
38 authored `.tsrx` files in the 19 checked examples (excluding generated build
directories); that measures this experiment's syntax restriction, not the upper
bound of automatic shell removal.

One matched `<div>`-root build before the framed-root recovery fix on Node 26.4.0 and Vite
8.1.5 produced the following total gzip-9 client JavaScript sizes, counting
every reachable chunk:

| Client path | Gzip bytes | Change from baseline |
| --- | ---: | ---: |
| Ordinary compiler | 62,385 | — |
| Generated shell, generic helpers | 94,137 | +31,752 (+50.9%) |
| Generated shell, fingerprinted void helpers | 61,919 | -466 (-0.75%) |

The server document was 991 raw bytes and the emitted CSS was 68 raw bytes in
each build. All three emitted client graphs passed the jsdom and Chromium
identity, focus, interaction, and effect-order checks; Chromium also checked
CSS and the dynamic chunk request. The historical temporary results directory
was named `octane-automatic-shell-nD9WgB` and is not published here;
`report.json` has SHA-256
`08cdca67f1bc5882f87fe43da21825406f6ee21aedd7541054a1f2890e127325`.
It records hashes of the build inputs, including the two modified hydration
sources, and the emitted assets. The compressed-size difference is small for
this fixture and excludes any general fallback.

## Signal Chat route admission

The real `examples/signal-chat/src/App.tsrx` is not eligible for this generator.
It has multiple exports, route-dependent shell expressions and five independent
`Hydrate` boundaries. Those boundaries are discovered from the original module
by Octane's compiler; replacing it before that pass would remove their activation
metadata. Moreover, the real bootstrap owns streamed signal and document
identity, early event capture, `preHydrate`, root boundaries and disposal. The
one-time immutable-root condition is not proven for this route. No transformed
route is emitted, and no runtime fallback has been added.

```sh
node --test benchmarks/streamed-shell-prototype/automatic/signal-chat-fallback.test.mjs
```

This test compiles the original route for server and client under the app's
actual compiler root, checks their five boundary identities and schemas, and
builds the original Vite library entry twice plus a candidate with the shell
plugin. The candidate is rejected at build time. Each build must retain all
five compiler-derived manifest records, their emitted activation chunks, both
route exports and the route stylesheet. The test reports the compressed sizes
of the entire reachable library graph and its entry; it does not run the app's
generated bootstrap, evaluate the browser modules, or demonstrate streaming
behavior. Because the candidate falls back, these sizes do not measure an
optimized Signal Chat route or the savings from removing its shell. Chunk hashes
and specialization may vary between builds, so the manifest and asset
assertions do not rely on byte-identical JavaScript.

A synthetic outer wrapper around the unchanged `App` could leave its five
island entries intact, and the compiler currently gives `App` and `EagerApp`
void-export proofs. That would optimize only newly added wrapper markup. The
current surrogate cannot support ordinary client mount or recovery after a
root mismatch: it retains no template or binding bag. Selecting it with a DOM
check before `hydrateRoot` does not establish its lifetime, either. The
runtime can retry root adoption and, after a native signal adoption miss, call
`root.render` internally with the already selected component. The `adopt`,
`owner.retry`, and `nativeRecovery` branches are in
`packages/octane/src/runtime.ts` in `hydrateRootWithOutputHandler`; native
adoption misses originate in `packages/octane/src/signals/engine.ts`. The
internal `root.render` is a normal client render, for which the surrogate is
invalid. We have not established
that Signal Chat triggers that recovery; the point is that the route bootstrap
alone cannot rule it out. A safe extension needs a runtime/compiler contract
for switching to the ordinary component with correct scope and teardown, and
must count that fallback's code and loading cost. The wrapper is not enabled.

The build-only counterfactual below generates an extra `<div>` wrapper around
the unchanged App in memory. It verifies the original App's five emitted island
entries and the wrapper's compiler site and void proofs, then reports sizes for
the full reachable library graph. The ordinary and generated variants have the
same extra wrapper. This is a hypothetical omission of newly added wrapper code,
not a measurement of removing the actual App shell. It has no ordinary fallback
or bootstrap and is never executed; it does not establish streaming, mismatch,
remount, or browser behavior.

```sh
node --test benchmarks/streamed-shell-prototype/automatic/signal-chat-wrapper.test.mjs
```

An islands-only route is a separate possible experiment: Octane's independent
bootstrap already observes streamed sidecars, reconstructs their strategies,
loads activation modules and styles, and joins the document signal owner. The
current generated app bootstrap nevertheless follows this with the parent root.
Omitting that root still needs proof of shell immutability, eager-dependent
props, controls, module effects and CSS, plus mismatch recovery and ownership
handoff if fallback occurs after an island activated. A one-off bootstrap
rewrite would also need to keep the source module's island manifest discoverable
without requesting the parent graph initially. None of these is established by
the build-only wrapper test.
