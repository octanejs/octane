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
