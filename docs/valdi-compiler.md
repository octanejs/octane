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

Direct compiler integrations can set `output: 'ts'` alongside the Valdi renderer
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

The returned source map still has one source, the authored `.tsrx` or `.ts` file,
and includes its source content. A host can append an inline map when writing the
generated `.ts` file. TypeScript does not automatically compose input source maps:
the host or Valdi emit integration must compose the TypeScript-to-JavaScript map
with this map before reporting authored diagnostic or stack-trace locations.

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
with the same Valdi renderer, for example in a `.tsrx` module or a direct
`compile()` call. The bundler's lighter plain `.ts`/`.js` hook-slot pass does
not reroute those imports to the adapter. Such helpers need explicit adapter
imports or application-owned module resolution; selecting the target for a
component alone does not adapt its entire dependency graph.

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
