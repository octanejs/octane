# Valdi writer compiler

The experimental `valdi` target compiles `.tsrx` and `.tsx` components to
Valdi-style writer calls. It is opt-in and client-only. The DOM and universal
targets keep their existing compiler and runtime paths.

This package supplies the compiler, not a Valdi renderer or hook runtime. An
application must provide an adapter implementing the contract below. Compiling
successfully does not establish native rendering or lifecycle correctness.

## Select the target

```ts
import { compile } from 'octane/compiler';

const result = compile(source, 'src/Scene.tsrx', {
	mode: 'client',
	hmr: false,
	renderer: {
		id: 'valdi',
		module: '@example/valdi-adapter',
		target: 'valdi',
		server: 'unsupported',
		text: 'reject',
	},
});
```

`module` is an application-provided package or project-root module identifier.
`@example/valdi-adapter` is a placeholder, not an adapter bundled with Octane.
Generated imports are resolved by the consuming build; the compiler does not
load the adapter while compiling. The declarative registry rejects relative
`./` and `../` module identifiers.

The same target is accepted by the declarative renderer registry:

```ts
import { octane } from 'octane/compiler/vite';

octane({
	hmr: false,
	renderers: {
		registry: {
			valdi: {
				module: '@example/valdi-adapter',
				target: 'valdi',
				server: 'unsupported',
				text: 'reject',
			},
		},
		rules: [{ include: 'src/**/*.valdi.tsrx', renderer: 'valdi' }],
	},
});
```

HMR must be disabled for this target. Registry selection is a compiler facility,
not a native application build, packaging, or deployment integration.

## TypeScript output

Direct compiler integrations and `createOctaneCompiler` from
`octane/compiler/bundler` can set `output: 'ts'` alongside the Valdi renderer
and `hmr: false`. Both `.tsrx` components and plain `.ts` custom-hook modules then
produce TypeScript, with `result.lang === 'ts'`. The output contains writer calls,
not JSX. The default remains `output: 'js'`. The same option also supports
[web DOM and SSR output](./compiler-typescript-output.md); universal-renderer
TypeScript output is not yet supported. Valdi's existing client-only, HMR, and
syntax restrictions still apply.

TypeScript output retains interfaces, type aliases, type-only imports and exports,
annotations, type arguments, assertions, `satisfies`, non-null assertions, enums,
namespaces, ambient declarations, and parameter properties. The downstream
TypeScript compiler owns their erasure and runtime lowering. This mode is intended
for typed build pipelines such as Valdi's; bundler integrations still emit
JavaScript by default.

Leading comments on retained declarations, statements, and members are preserved,
including Valdi's JSDoc annotations. Leading component comments follow the generated
component declaration. Comments inside lowered templates, expression comments,
and trailing comments are not preserved. TypeScript output omits generated
indentation so that multiline annotation blocks keep their authored text even
inside nested scopes. Writer component bodies return `void`;
their authored JSX return annotation is replaced by that inferred writer result.
Props annotations, generic parameters, and explicit component-binding types remain.

The adapter must provide typed declarations for generated calls. In particular,
`defineValdiComponent` must carry the render function's props type through to its
returned descriptor, and slot-taking hooks must preserve their generic state and
callback types. Compiler tests check the output and consumer prop errors against
a typed stub adapter; Octane does not yet ship a complete adapter declaration
contract or a native Valdi integration.

The returned source map has one source, the authored `.tsrx` or `.ts` file, and
includes its source content. Keep it alongside the generated code until the
downstream emit; TypeScript does not automatically compose input source maps.

### Valdi Workspace handoff

The [public Valdi companion](https://github.com/Snapchat/Valdi/blob/3ed77a5ace883991e51169168ccf3e68a7c68599/compiler/companion/src/Workspace.ts)
accepts generated TypeScript through `registerInMemoryFile`. Its constructor
takes ordinary TypeScript compiler options, rather than a source-transform or
input-map callback. Use `createOctaneCompiler({ output: 'ts', hmr: false,
renderers: ... })` with the same renderer selection for components and their
plain TypeScript hook modules.

Register each `.tsrx` result under an absolute virtual filename ending in
`.tsrx.ts`; register plain `.ts` helpers under their original filename. This lets
an unchanged `./Widget.tsrx` import resolve through TypeScript's normal lookup.
Open the registered files, then use `doEmitFile(filename, cancellationToken,
customTransformers)` or `emitFile(filename)`. The former retains the caller's
TypeScript transformers alongside Valdi's defaults. Re-registering changed
content invalidates Valdi's source-file snapshot; invalidate the corresponding
authored path in the Octane compiler as well.

For source maps, enable `inlineSourceMap` and `inlineSources` in the Workspace
options and pass **map-free `result.code`** to `registerInMemoryFile`. TypeScript
5.3.3 copies an incoming inline-map comment before appending its own, while
Valdi's `SourceMapUtils` reads the first comment. Feeding an inline Octane map
into this emit therefore selects the wrong downstream map.

After emission, create a separate inline-map carrier from `result.code` and
`result.map`, and pass that carrier and the emitted JavaScript to the companion's
`SourceMapUtils.mergeSourceMaps`. Normalize the prior map to an absolute authored
`sources[0]` and an empty `sourceRoot`; this keeps files with the same basename
distinct and avoids dependence on the downstream root. The composed map must
retain the original `sourcesContent`, and the final JavaScript must have one
source-map comment. The carrier is composition data, not the Workspace input.

The executable recipe is
[`scripts/test-valdi-typescript-build.mjs`](../scripts/test-valdi-typescript-build.mjs).
It uses the unmodified public companion at the revision linked above, rather
than a consumer's patched compiler:

```bash
node scripts/prepare-valdi-companion.mjs "$HOME/.cache/octane/valdi-companion-3ed77a5"
OCTANE_VALDI_COMPANION_DIR="$HOME/.cache/octane/valdi-companion-3ed77a5" \
  node scripts/test-valdi-typescript-build.mjs
```

Setup keeps the SDK outside the checkout, verifies immutable public source and
license hashes, and installs three exact dependencies with npm integrity checks
and lifecycle scripts disabled. A missing or mismatched SDK fails the integration
check; it never silently skips. The companion's `valdi-compiler-js` package is
not published to npm at this pin, so setup builds its Workspace dependency
closure from public source.

The check covers the real TypeScript program emit, default and supplied host
transformers, declarations/native-model annotations, plain hook import routing,
unchanged cross-file imports, repeated edits, same-basename source identity,
and composed error locations. It executes the result with the existing synthetic
writer recorder. This establishes a build handoff; Swift/native packaging,
native lifecycle behavior, and a published adapter remain separate acceptance
steps.

## Adapter contract

`VALDI_COMPILER_ABI_VERSION`, exported by `octane/compiler`, identifies the
generated contract. Its initial value is `1`. Each generated module calls
`assertValdiCompilerAbi(version)` before creating prototypes or registering
components. An adapter must reject incompatible versions before any of that
work happens. Include the compiler version, ABI version, and renderer
configuration in persistent compilation cache keys.

The following exports are required when used by a compiled module:

| Export | Contract |
| --- | --- |
| `assertValdiCompilerAbi(version)` | Reject unsupported compiler ABI versions. |
| `jsx` | Stable writer facade with the methods below. |
| `defineValdiComponent(render, { hasHooks })` | Register a writer function and return an opaque component descriptor. `hasHooks` is conservative; render-time calls may invoke custom hooks. |
| `getValdiComponentConstructor(component)` | Resolve a descriptor to the constructor accepted by `jsx.beginComponent`. |
| `valdiKey(prototype, ...keys)` | Produce a stable writer key for the opaque call-site prototype and ordered key parts. Distinguish types and key boundaries; the compiler neither encodes keys nor reads prototype fields. |
| `setValdiAttributes(props)` | Apply the complete spread-attribute set to the current host, clearing previously supplied attributes that are now absent. |

These bridge exports are a new Octane-facing adapter contract, not exports
already supplied by Valdi. The `jsx` methods below follow the
[public Valdi writer surface](https://github.com/Snapchat/Valdi/blob/1ca7a06f349c6967ac93aadb814c3e3bb221e1ac/src/valdi_modules/src/valdi/valdi_core/src/JSXBootstrap.ts):

| Method | Purpose |
| --- | --- |
| `makeNodePrototype(tag, staticPairs?)` | Create an opaque host prototype. Pairs are a flat `[name, value, ...]` array. |
| `makeComponentPrototype(staticPairs?)` | Create an opaque component-props prototype. |
| `beginRender(prototype, key)` / `endRender()` | Open and close a host element. |
| `setAttribute(name, value)` | Apply an attribute with the host's normal normalization and observation behavior. |
| `setAttributeBool`, `setAttributeNumber`, `setAttributeString`, `setAttributeFunction`, `setAttributeStyle` | Apply a proven attribute kind without changing its host semantics. |
| `beginComponent(constructor, prototype, key)` / `endComponent()` | Open and close a child component. |
| `setViewModelProperty(name, value)` | Apply a dynamic component prop. |
| `setViewModelFull(props)` | Replace a component's complete spread-props set. |

Prototypes are created once per generated module. A missing key is passed as
`undefined`; explicit non-nullish keys and keyed loop paths are delegated to
`valdiKey`. Host parents establish a new child-key scope. Attribute expressions
and spread getters retain authored evaluation order; `key` is not forwarded as
a host attribute or component prop.

### Optional host text and refs

The default compiler ABI stays at 1. A renderer can opt into ABI 2 by setting
`text: 'host'` or by including `'host-ref'` in its `capabilities`. A compiled
module using either option calls `assertValdiCompilerAbi(2)` before any
prototypes are created; an ABI 1 adapter must reject it. Set these options only
after the selected adapter implements the corresponding contract.

- With `text: 'host'`, implement `jsx.appendText(value)`. It writes text under
  the current open host in authored order. Values may be dynamic; the adapter
  must accept strings and numbers, ignore nullish/boolean values, and reject
  other values visibly. It owns retaining, updating, and clearing the text.
  Use the existing `validation.textParents` and `validation.textHosts` to
  restrict where authored text and text hosts can occur. Dynamic values still
  require adapter-side checks.
- With `capabilities: ['host-ref']`, authored host refs use the existing
  generic `jsx.setAttribute('ref', value)` path. Spread refs are included in
  `setValdiAttributes(props)` after normal last-write-wins merging, with each
  getter evaluated once. The host owns ref attachment, replacement, and cleanup.
  Component refs and `children` props remain unsupported.

### Authored text sites and supported hosts

An adapter that needs identity for each authored text site may opt into
`text: 'host'` plus `capabilities: ['host-text-site']`. It must accept compiler
ABI 3 and implement `jsx.renderText(prototype, value, key)`. The compiler
creates one opaque `jsx.makeNodePrototype('#text')` per authored text site.
`key` carries the same ordered keyed-loop path as an element; outside a loop
it is `undefined` and the prototype identifies the site within its parent.
The adapter owns identity, updates, cleanup, and validation of the value.
It must accept primitive strings/numbers, ignore nullish and boolean values,
and reject other non-array values. Arrays of text values arrive unchanged as
one authored site; the adapter owns how their contents are written. Scalar
conditionals keep one site across branch changes. In an array literal that
contains JSX, each distinct JSX/text site is emitted in authored order.

This option allows a text-only root as well as text beneath an open host.
Adapters that only implement ABI 1 or 2 are rejected before prototypes are
created; append-only text retains its ABI 2 contract when this capability is
omitted. `'host-text-site'` is invalid unless `text` is `'host'`.

To restrict the authored intrinsic vocabulary, set
`validation: { allowedTags: ['frame', 'badge', 'text-box'] }` on a renderer.
Only lower-case intrinsic host names are checked, before prototypes are
created. Component names are unaffected; their implementations are checked
normally. An omitted list allows every otherwise-supported tag, while an
empty list allows no authored host tags. This composes with `textParents`,
`textHosts` and `hostProps`; it never overrides other target restrictions.

Editor integrations can already use `compileToVolarMappings` with
`options.renderers` and the renderer's `intrinsics` module. Use the same
default/rules as build-time compilation. The adapter is never executed during
type checking, and an authored leading JSX pragma still takes precedence.

The adapter also owns component instances, scheduling, error recovery, unmount,
hook state, and effect cleanup. Writer calls are not a transaction or a native
renderer implementation supplied by this compiler. If rendering throws, the
adapter must restore its writer and hook scopes.

### Hooks

The supported hooks are `useState`, `useMemo`, `useCallback`, `useLayoutEffect`,
and `useRef`. Their imports are routed to the selected adapter. They retain
Octane's compiler-assigned opaque slot convention, including conditional hooks,
dependency inference, and the third state getter.

Adapters must implement the existing generated hook helpers when used:
`hookSlots`, `withSlot`, `__useStateWithGetter`, and `__methodDep`. These are
versioned compiler-to-adapter exports, not promises about a runtime's object
layout. The compiler emits no owner-field access or host memoization protocol.
See [Octane's hook semantics](./differences-from-react.md) for the observable
state and dependency behavior.

Custom hooks that import Octane hooks must pass through the same full compiler
with the same Valdi renderer. The bundler-neutral `output: 'ts'` path does this
for plain `.ts` helpers as well as `.tsrx` components. Cover both with the
renderer registry's default or rules. The default JavaScript path's lighter
plain-module hook-slot pass does not reroute those imports; selecting the target
for a component alone does not adapt that dependency graph.

## Attribute type facts

The compiler uses conservative syntax and lexical proofs for specialized
attribute writers. A caller with a type checker may additionally supply
`valdiWriterFacts`:

```ts
import type { ValdiWriterFacts } from 'octane/compiler';

const facts: ValdiWriterFacts = {
	version: 1,
	expressions: [
		{ start: 42, end: 53, effectiveType: 'number', isNullable: false },
	],
};
```

Offsets are UTF-16 code units into the exact source passed to `compile`, with an
exclusive `end`. Each range must describe one complete authored expression.
The example offsets are illustrative, not facts for a particular component.
Supported effective types are `boolean`, `number`, `string`, `function`, and
`style`; nullability is recorded separately. Facts are trusted input and must
not be reused after source edits. Missing proofs fall back to the generic
writer. The compiler entry does not import a TypeScript checker or native SDK.

## Supported scope and diagnostics

The initial target supports stable module-level function and `const`
components, imported components, fragments, dynamic attributes, ordered
spreads, early returns, conditionals, and explicitly keyed template loops.
Mutable `let`/`var` components and writes to component bindings are rejected.
Both development and production compilation use the same external writer
contract.

Unsupported constructs fail with diagnostics rather than falling back to DOM
code. These include server rendering/hydration, HMR, Octane profiling,
cross-renderer boundaries, dynamic or namespace component tags, component
children/render props, authored `ref`/`children` props, `@try`, `@switch`, and
`style`/`slot`/`slotted` elements. Spread `ref`/`children` values are checked at
execution time. Unkeyed or asynchronous template loops and slot-keyed hooks
directly inside loops are rejected; put hooks in a keyed child component.

Raw text is rejected by default. Use a host attribute such as a label's value,
or explicitly choose `text: 'ignore'` to discard raw text. `text: 'host'` is not
supported.

Tests execute generated modules against a small synthetic writer recorder and
check diagnostics, source maps, compiler selection, and neighboring targets.
They do not validate a native Valdi application or establish a performance win.
