# TypeScript compiler output

Direct build integrations can ask `compile()` to emit TypeScript for web DOM
client code, SSR, and the experimental [Valdi target](./valdi-compiler.md):

```ts
import { compile } from 'octane/compiler';

const result = compile(source, '/src/App.tsrx', {
	output: 'ts',
	mode: 'client', // or 'server' for web SSR
	hmr: false,
});
// result.lang === 'ts'; result.code contains TypeScript without JSX.
```

JavaScript remains the default (`output: 'js'`). Bundler integrations continue
to emit JavaScript unless their host explicitly requests and handles TypeScript.
The universal renderer does not yet support this option. Existing renderer
restrictions still apply; Valdi remains client-only.

Both `.tsrx` components and plain `.ts`/`.mts`/`.cts` modules retain authored
interfaces, type aliases, type-only imports and exports, explicit annotations,
generic parameters, assertions, `satisfies`, enums, namespaces, ambient
declarations, and parameter properties. A downstream TypeScript compiler owns
their erasure and runtime lowering. Component props retain their declared types,
including contextual function types on variable bindings and `as`/`satisfies`
constraints. The generated writer or SSR body determines the lowered result type.

Use `octane-tsc` to check authored source. Generated web code includes private
runtime parameters, DOM navigation, and capture environments that do not exist
in the source. These receive compiler-owned types; opaque environments and
template paths may use `any`. TypeScript output does not reconstruct every
inferred type after code is moved into a helper. Explicit types remain, and local
type declarations used by hoisted bodies and signatures are lifted with fresh
names. Copies of types derived from component-local values may also become
opaque; their original authored declarations remain intact. The generated
code's runtime calls use Octane's actual declarations, including numeric hook
slots accepted by the compiler ABI. Public `useLazyRef` calls still accept only
manual Symbol slots; generated numeric slots use a type-only ABI bridge.

Leading comments on retained declarations, statements, and members survive,
including JSDoc annotations. Comments inside lowered templates, expression
comments, and trailing comments are not preserved. Generated TypeScript omits
indentation so multiline annotation blocks retain their exact authored text.

The result uses the existing single print and source map, with the authored file
as its one source and with `sourcesContent` included. TypeScript does not
automatically consume this input map: the build host must compose it with the
downstream TypeScript emit map for authored stack-trace locations. Source checking
through `octane-tsc` already reports diagnostics against the authored file.

## Build integrations

Vite accepts the same opt-in through `octane/compiler/vite` and
`@octanejs/vite-plugin`:

```ts
import { octane } from 'octane/compiler/vite';

export default {
	plugins: [octane({ output: 'ts' })],
	build: { sourcemap: true },
};
```

Octane produces the typed intermediate, then Vite's OXC transform emits
JavaScript and composes its map with Octane's map. This applies to development,
client builds, and SSR. Vite's configured OXC TypeScript options remain in
effect; disabling OXC is incompatible with this option. The plugin still returns
JavaScript to Vite's remaining pipeline. Production builds need
`build.sourcemap: true` to retain the final maps.

Other build hosts can use `createOctaneCompiler({ output: 'ts' })` from
`octane/compiler/bundler`. Its transform result carries `lang: 'ts'` and the
authored source map for components and eligible automatically slotted TypeScript
hook modules. Existing module ownership and manual-slot rules still apply.
The host owns module resolution, type checking, downstream emission, and map
composition. See the [executable Valdi Workspace integration](./valdi-compiler.md#valdi-workspace-handoff)
for the pinned public SDK setup and post-emit composition recipe.
