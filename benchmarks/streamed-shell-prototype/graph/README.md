# Vite component graph report

This is an observational prototype. It adds a Vite build plugin that reads source before the Octane transform, uses Octane's parser and lexical analysis, and records source clues alongside the bundler's module and chunk graph. It returns no transformed code and does not intentionally remove or rewrite components. Its resolution queries invoke other Vite plugins' resolve hooks, which may themselves have effects; output equivalence was checked only for the builds described below. It does not estimate removable bytes.

Run these commands from the repository root after installing the workspace dependencies. Each output and report path must be fresh; the runner rejects an existing path and rejects a Vite configuration that resolves the client output to a different directory.

```sh
node --test benchmarks/streamed-shell-prototype/graph/graph.test.mjs

task_dir=$(mktemp -d)
node benchmarks/streamed-shell-prototype/graph/build.mjs \
  --root=benchmarks/streamed-shell-prototype/graph/fixtures \
  --config=benchmarks/streamed-shell-prototype/graph/fixtures/vite.config.mjs \
  --out-dir="$task_dir/out" --report="$task_dir/report.json"
```

The test builds the controlled fixture with and without the plugin and compares every emitted file's hash. It also checks conditional and uncalled nested JSX, a dynamic root, barrel, namespace, memo wrapper and reassigned component, query-qualified module identities, dynamic chunks, CSS, shared imports, and an observable module effect.

For an installed Cinebase example:

```sh
task_dir=$(mktemp -d)
node benchmarks/streamed-shell-prototype/graph/build.mjs \
  --root=examples/cinebase \
  --out-dir="$task_dir/out" --report="$task_dir/report.json"
```

Octane's app plugin controls its own `dist/client` and also builds `dist/server`. To inspect generated route bootstrap with Signal Chat, use a disposable copy so those paths cannot overwrite an existing example build. The links below point to the installed workspace packages.

```sh
sample=$(mktemp -d)
tar -C examples/signal-chat --exclude=node_modules --exclude=dist -cf - . | tar -C "$sample" -xf -
mkdir -p "$sample/node_modules/@octanejs"
ln -s "$PWD/packages/app-core" "$sample/node_modules/@octanejs/app-core"
ln -s "$PWD/packages/vite-plugin-octane" "$sample/node_modules/@octanejs/vite-plugin"
ln -s "$PWD/packages/octane" "$sample/node_modules/octane"
ln -s "$PWD/node_modules/vite" "$sample/node_modules/vite"
node benchmarks/streamed-shell-prototype/graph/build.mjs \
  --root="$sample" --out-dir="$sample/dist/client" --report="$sample/report.json"
```

## How to read the report

`roots` recognizes only direct calls to a named `hydrateRoot` import from `octane`, with a lexically resolved, directly named component when possible. Indirect calls, runtime selection, wrappers, and generated entry export selection remain unknown. For Octane's generated route bootstrap, `routeHints` records literal dynamic-import targets from its generated route table, including pre-hydration hooks; it does not prove which export hydrates or associate a component with a root.

`syntacticPathsFromRoots` follows resolved JSX sites through source, including conditional JSX and JSX inside an uncalled nested function. It does not establish runtime reach, and an absent path does not mean unreachable. Barrels, namespace members, dynamic or reassigned bindings, wrapped components, packages outside the configured source root, and query-qualified modules are not resolved as component targets. Query-qualified Vite IDs remain distinct in all module and chunk facts and are marked unparsed.

Classifications are leads: `observed-client-activity` indicates a syntactic event handler, ref, or direct Octane hook; `further-analysis-needed` records other dynamic clues; `static-markup-lead` means no tracked clue was found. None proves that updates, remounts, effects, props, context, or reactive dependencies cannot matter. Imports, CSS, module side-effect metadata, top-level source observations, chunk ownership, and rendered lengths are evidence for further investigation, not proof that anything can be removed. Entry ownership follows static chunk imports from entry and dynamic-entry chunks; it is not a measurement of requests made by a user. The reported chunks and assets are the plugin's `generateBundle` snapshot and may omit files emitted or moved later, including HTML. Raw module rendered lengths are not per-component, compressed, or transfer savings.

## Local sample

In one local build, Cinebase had one directly resolved hydration call, 15 component definitions linked by syntactic paths, and two unresolved JSX sites. Of the 15 definitions, seven had observed activity, seven needed further analysis, and one was a static-markup lead. Its complete four-file on-disk output was byte-identical with and without the plugin.

Signal Chat's generated bootstrap had one hydration call with an unknown target and two route-module hints. It contained eight detected source component definitions, none linked to that unresolved root; five query-qualified App modules were kept distinct and marked unparsed. Eighteen of 19 client files matched the uninstrumented build byte for byte. The remaining hydrate chunk matched after replacing Octane's fresh per-build UUID, which also changed the chunk filename. The generated HTML and both Octane manifests matched after normalizing that UUID and filename. Server bundles also required normalizing cwd-relative region comments and a derived chunk filename; their raw bytes were different. Vite's temporary `.vite/manifest.json` was not retained on disk. These observations describe these builds, not runtime behavior or a savings estimate.
