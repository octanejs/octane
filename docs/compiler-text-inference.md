# Type-aware text compilation

Octane normally classifies template children from their syntax. String and
template literals, string concatenations, explicit string assertions, and some
local bindings select the text-binding path. An unshadowed built-in
`String(value)` call also selects that path; the conversion still executes.
Other expressions remain general renderables, which can contain elements,
arrays, components, or primitive values.

The experimental, Node-only `octane/compiler/typescript` entry point can also
prove that an authored child expression has a primitive-string TypeScript type.
This covers cases such as typed properties, destructuring, imported aliases,
string-returning functions, and control-flow narrowing. It does not make the
ordinary `octane/compiler` entry point depend on a TypeScript checker.

## Use the project adapter

Install TypeScript 5.9 alongside Octane when using this entry point. TypeScript
is an optional peer dependency; applications that do not use the adapter do not
need to initialize a checker.

```ts
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { compile } from 'octane/compiler';
import { createTextTypeProject } from 'octane/compiler/typescript';

const project = createTextTypeProject({
	tsconfig: resolve('tsconfig.json'),
});

try {
	const filename = resolve('src/App.tsrx');
	const source = readFileSync(filename, 'utf8');
	const textTypeFacts = project.snapshot(filename, source);

	const client = compile(source, filename, {
		mode: 'client',
		hmr: false,
		textTypeFacts,
	});
	const server = compile(source, filename, {
		mode: 'server',
		textTypeFacts,
	});
	// Write or pass client.code and server.code to the rest of the build.
} finally {
	project.dispose();
}
```

Reuse a project for related files. A snapshot is serializable and bound to its
filename, exact source version, and project generation. Pass the same snapshot
to client and server compilation: text classification affects SSR separators
and hydration layout. Supplying malformed, source-stale, or wrong-file facts is an
error; omitting `textTypeFacts` retains syntax-only compilation.

The adapter does not install filesystem watchers or connect itself to a
bundler's module graph. Call `project.invalidate(filename)` after a file changes,
or `project.invalidate()` to discard every cached source. Both forms reload the
project configuration and roots. Do not cache an unchanged component's compiled
output across an imported type change without
invalidating that output too. Automatic Vite, Rspack, and HMR integration is not
part of this experimental API.

## Safety boundary

Inference requires effective `strictNullChecks`. The analysis also enables
`noUncheckedIndexedAccess`, so potentially missing array entries and index
signature properties do not become non-null string proofs. `any`, `unknown`,
`never`, boxed `String`, nullable or mixed unions, unresolved types, and
ambiguous source mappings retain the general-renderable path.

A TypeScript type is a static contract, not a runtime conversion. For example,
`count as string` can be an invalid assertion when `count` is a number; use
`String(count)` when conversion is intended. The compiler never removes that
call or changes its evaluation count. Incorrect declarations, unchecked casts,
and deliberately replaced JavaScript built-ins can still violate a typed
program's assumptions. Recognized direct writes to the global `String`
constructor disable new inferred text proofs in that module; an explicit
authored `as string` keeps
its existing text intent. The compiler cannot detect replacement in an unrelated
module or independently verify whether an imported type has changed since a
snapshot was taken.

These facts specialize DOM child text only. They do not change attribute
coercion, `dangerouslySetInnerHTML` validation, or the treatment of unproven
renderable children.
