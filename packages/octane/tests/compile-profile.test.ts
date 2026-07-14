import { describe, expect, it } from 'vitest';
import * as Octane from '../src/index';
import { compile } from '../src/compiler/compile.js';
import { slotHooks } from '../src/compiler/slot-hooks.js';

const SOURCE =
	"import { useState } from 'octane';\n" +
	'function Lite() @{\n' +
	'  <span>lite</span>\n' +
	'}\n' +
	'export function App() @{\n' +
	'  const [count] = useState(0);\n' +
	'  <main><Lite/><p>{count as string}</p></main>\n' +
	'}\n';

const GENERIC_SOURCE = `
import { memo, useState } from 'octane';
export const Arrow = () => <div/>;
export const Expression = function () { return <span/>; };
export const Memoed = memo(() => {
	const [count] = useState(0);
	return <p>{count as string}</p>;
});
export function Conditional(props) {
	if (props.first) return <b/>;
	return props.second ? <i/> : null;
}
export function Outer() {
	function Nested() { return <small/>; }
	return <Nested/>;
}
export function NullOnly() { return null; }
export const Primitive = () => 42;
function LocalArray() { return [null, 'array']; }
export function UsesNonJsx() { return <><NullOnly/><Primitive/><LocalArray/></>; }
export default () => <footer/>;
`;

describe('profile compiler metadata', () => {
	it('keeps compiler profiling ABI helpers off the main Octane namespace', () => {
		expect(Octane).not.toHaveProperty('__profileComponent');
		expect(Octane).not.toHaveProperty('__profileHook');
	});

	it('leaves normal client and server compiler output byte-identical', () => {
		const client = compile(SOURCE, '/src/App.tsrx', { hmr: false, dev: false });
		const explicitOff = compile(SOURCE, '/src/App.tsrx', {
			hmr: false,
			dev: false,
			profile: false,
		});
		expect(explicitOff).toEqual(client);

		const server = compile(SOURCE, '/src/App.tsrx', { mode: 'server' });
		const serverProfile = compile(SOURCE, '/src/App.tsrx', {
			mode: 'server',
			profile: true,
		});
		expect(serverProfile).toEqual(server);
		expect(serverProfile.code).not.toContain('__profile');
	});

	it('registers stable component and hook metadata without wrapping component bindings', () => {
		const { code } = compile(SOURCE, '/src/App.tsrx', {
			hmr: false,
			dev: false,
			profile: true,
		});

		expect(code).toContain(
			"import { __profileComponent as _$__profileComponent, __profileHook as _$__profileHook } from 'octane/profiling';",
		);
		const mainRuntimeImport = code.match(/^import \{ ([^}]*) \} from 'octane';$/m)?.[1];
		expect(mainRuntimeImport).not.toContain('__profile');
		expect(code).toContain(
			'_$__profileComponent(Lite, {"id":"/src/App.tsrx#Lite@2:0","name":"Lite","file":"/src/App.tsrx","line":2,"column":0,"kind":"component"});',
		);
		expect(code).toContain(
			'_$__profileComponent(App, {"id":"/src/App.tsrx#App@5:7","name":"App","file":"/src/App.tsrx","line":5,"column":7,"kind":"component"});',
		);
		expect(code).toMatch(
			/const _h\$0 = _\$__profileHook\(Symbol\("[a-z0-9]+#0"\), \{"id":"\/src\/App\.tsrx#App@5:7#hook:0","componentId":"\/src\/App\.tsrx#App@5:7","name":"useState","kind":"useState","file":"\/src\/App\.tsrx","line":6,"column":18,"index":0\}\);/,
		);

		// Registration is a side-effect call on the original binding, not an
		// expression that replaces or wraps the component value.
		expect(code).toContain('export const App = Object.assign(function App(');
		expect(code).not.toContain('const App = _$__profileComponent');
	});

	it('registers the canonical webpack HMR wrapper after hot handoff', () => {
		const { code } = compile(SOURCE, '/src/App.tsrx', {
			hmr: 'webpack',
			profile: true,
		});
		const handoff = code.indexOf('import.meta.webpackHot.accept();');
		const registration = code.lastIndexOf('_$__profileComponent(App,');
		expect(handoff).toBeGreaterThan(-1);
		expect(registration).toBeGreaterThan(handoff);
		expect(code).toContain('_$__profileHook(Symbol.for("octane:/src/App.tsrx:App.useState#0")');
	});

	it('registers declarations before a same-module top-level mount', () => {
		const source = `
import { createRoot } from 'octane';
export function App() @{ <main>ready</main> }
createRoot(document.body).render(App);
`;
		const normal = compile(source, '/src/entry.tsrx', { hmr: false });
		expect(compile(source, '/src/entry.tsrx', { hmr: false, profile: false })).toEqual(normal);

		const { code } = compile(source, '/src/entry.tsrx', { hmr: false, profile: true });
		const mount = code.indexOf('createRoot(document.body).render(App);');
		const firstRegistration = code.indexOf('_$__profileComponent(App,');
		const finalRegistration = code.lastIndexOf('_$__profileComponent(App,');
		expect(mount).toBeGreaterThan(-1);
		expect(firstRegistration).toBeGreaterThan(-1);
		expect(firstRegistration).toBeLessThan(mount);
		expect(finalRegistration).toBeGreaterThan(mount);
	});

	it('adds equivalent hook metadata in the surgical TS/JS slot pass', () => {
		const source =
			"import { useState as state } from 'octane';\n" +
			'export function useCount() { const [count] = state(0); return count; }\n';
		const normal = slotHooks(source, '/src/use-count.ts', { hmr: false });
		const explicitOff = slotHooks(source, '/src/use-count.ts', {
			hmr: false,
			profile: false,
		});
		expect(explicitOff).toEqual(normal);

		const profiled = slotHooks(source, '/src/use-count.ts', { profile: true });
		expect(profiled?.code).toContain(
			"import { __profileHook as _$__profileHook } from 'octane/profiling';",
		);
		expect(profiled?.code).not.toContain(
			"import { __profileHook as _$__profileHook } from 'octane';",
		);
		expect(profiled?.code).toContain(
			'{"id":"/src/use-count.ts#useCount@2:7#hook:0","componentId":"/src/use-count.ts#useCount@2:7","name":"state","kind":"useState","file":"/src/use-count.ts","line":2,"column":45,"index":0}',
		);
		expect(profiled?.code).toContain('const [count] = state(0, _h$0);');
	});

	it('covers generic arrow, function-expression, memo, nested, and conditional components', () => {
		const normal = compile(GENERIC_SOURCE, '/src/generic.tsx', { profile: false });
		const implicit = compile(GENERIC_SOURCE, '/src/generic.tsx');
		expect(normal).toEqual(implicit);
		expect(normal.code).not.toContain('__profile');

		const { code } = compile(GENERIC_SOURCE, '/src/generic.tsx', { profile: true });
		expect(code).toContain('export const Arrow = _$__profileComponent(');
		expect(code).toContain('export const Expression = _$__profileComponent(');
		expect(code).toContain('export const Memoed = _$__profileComponent(');
		expect(code).toMatch(/"id":"\/src\/generic\.tsx#Conditional@\d+:\d+"/);
		expect(code).toMatch(/"id":"\/src\/generic\.tsx#Outer@\d+:\d+"/);
		expect(code).toMatch(/id: "\/src\/generic\.tsx#Nested@\d+:\d+"/);
		expect(code).toMatch(/id: "\/src\/generic\.tsx#default@\d+:\d+"/);
		expect(code).toMatch(/"componentId":"\/src\/generic\.tsx#Memoed@\d+:\d+"/);
		expect(code).not.toContain('#module@');
		expect(code).toMatch(/"id":"\/src\/generic\.tsx#NullOnly@\d+:\d+"/);
		expect(code).toMatch(/id: "\/src\/generic\.tsx#Primitive@\d+:\d+"/);
		expect(code).toMatch(/"id":"\/src\/generic\.tsx#LocalArray@\d+:\d+"/);

		// Nested declarations register in their lexical scope; top-level function
		// declarations remain tail-registered for HMR canonical-wrapper ordering.
		const nestedDeclaration = code.indexOf('function Nested()');
		const nestedRegistration = code.indexOf('_$__profileComponent(Nested,');
		const outerRegistration = code.indexOf('_$__profileComponent(Outer,');
		expect(nestedRegistration).toBeGreaterThan(nestedDeclaration);
		expect(nestedRegistration).toBeLessThan(outerRegistration);
	});

	it('gives same-named nested definitions and their hooks distinct exact owner IDs', () => {
		const source = `
import { useState } from 'octane';
function Left() {
	function Same() { const [value] = useState(0); return null; }
	return <Same/>;
}
function Right() {
	function Same() { const [value] = useState(1); return null; }
	return <Same/>;
}
export function Host() { return <><Left/><Right/></>; }
`;
		const normal = compile(source, '/src/collision.tsx');
		expect(compile(source, '/src/collision.tsx', { profile: false })).toEqual(normal);

		const { code } = compile(source, '/src/collision.tsx', { profile: true });
		const ownerIds = [
			...code.matchAll(/"componentId":"(\/src\/collision\.tsx#Same@\d+:\d+)"/g),
		].map((match) => match[1]);
		expect(ownerIds).toHaveLength(2);
		expect(new Set(ownerIds).size).toBe(2);
		for (const id of ownerIds) expect(code).toContain(`id: "${id}"`);
	});

	it('uses the definition ID for compiler-generated parallel-use hooks', () => {
		const source = `import { use } from 'octane';
export function AsyncValue(props) @{
	const value = use(props.load());
	<p>{value as string}</p>
}`;
		const { code } = compile(source, '/src/parallel.tsrx', { profile: true });
		const definition = '/src/parallel.tsrx#AsyncValue@2:7';
		expect(code).toContain(`"id":"${definition}"`);
		expect(code).toContain(`"componentId":"${definition}"`);
		expect(code).not.toContain('#AsyncValue@3:');
	});

	it('registers an anonymous default primitive component without changing normal output', () => {
		const source = 'export default function () { return null; }\n';
		const normal = compile(source, '/src/empty.tsx');
		expect(compile(source, '/src/empty.tsx', { profile: false })).toEqual(normal);
		const { code } = compile(source, '/src/empty.tsx', { profile: true });
		expect(code).toContain('export default _$__profileComponent(');
		expect(code).toContain('function () {');
		expect(code).toContain('id: "/src/empty.tsx#default@1:15"');
	});

	it('registers local primitive functions re-exported as default', () => {
		for (const [filename, source, name] of [
			['/src/default-identifier.tsx', `const Text = () => 'hi'; export default Text;`, 'Text'],
			['/src/default-alias.tsx', `const Empty = () => null; export { Empty as default };`, 'Empty'],
		] as const) {
			const normal = compile(source, filename);
			expect(compile(source, filename, { profile: false })).toEqual(normal);
			const { code } = compile(source, filename, { profile: true });
			expect(code).toContain(`const ${name} = _$__profileComponent(`);
			expect(code).toContain(`id: "${filename}#${name}@1:6"`);
		}
	});
});
