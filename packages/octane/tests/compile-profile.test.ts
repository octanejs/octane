import { describe, expect, it } from 'vitest';
import * as Octane from '../src/index';
import { compile } from '../src/compiler/compile.js';
import { slotHooks } from '../src/compiler/slot-hooks.js';
import {
	inspectProfileOutput,
	type ProfileMetadata,
	uniqueMetadata,
	walkAst,
} from './_profile-output';

const SOURCE = `import { useState } from 'octane';
function Lite() @{
	<span>lite</span>
}
export function App() @{
	const [count] = useState(0);
	<main><Lite/><p>{count as string}</p></main>
}
`;

function expectValidComponent(metadata: ProfileMetadata, file: string) {
	expect(metadata).toMatchObject({ file, kind: 'component' });
	expect(metadata.id).toBe(`${metadata.file}#${metadata.name}@${metadata.line}:${metadata.column}`);
}

function callStart(ast: any, member: string): number | undefined {
	let start: number | undefined;
	walkAst(ast, (node) => {
		if (
			node.type === 'CallExpression' &&
			node.callee?.type === 'MemberExpression' &&
			node.callee.property?.name === member
		) {
			start = node.start;
		}
	});
	return start;
}

describe('profile compiler metadata', () => {
	it('keeps compiler-only helpers out of the public runtime namespace', () => {
		expect(Octane).not.toHaveProperty('__profileComponent');
		expect(Octane).not.toHaveProperty('__profileHook');
	});

	it('does not alter normal or server compilation', () => {
		const client = compile(SOURCE, '/src/App.tsrx', { hmr: false, dev: false });
		expect(
			compile(SOURCE, '/src/App.tsrx', {
				hmr: false,
				dev: false,
				profile: false,
			}),
		).toEqual(client);

		const server = compile(SOURCE, '/src/App.tsrx', { mode: 'server' });
		expect(
			compile(SOURCE, '/src/App.tsrx', {
				mode: 'server',
				profile: true,
			}),
		).toEqual(server);
	});

	it('describes authored components and hooks through the profiling subpath', () => {
		const output = inspectProfileOutput(
			compile(SOURCE, '/src/App.tsrx', {
				hmr: false,
				dev: false,
				profile: true,
			}).code,
		);

		expect(output.profileImports).toEqual(new Set(['__profileComponent', '__profileHook']));
		expect(output.mainImports).not.toContain('__profileComponent');
		expect(output.mainImports).not.toContain('__profileHook');

		const components = uniqueMetadata(output.components);
		expect(components.map(({ name }) => name).sort()).toEqual(['App', 'Lite']);
		for (const metadata of components) expectValidComponent(metadata, '/src/App.tsrx');
		expect(
			Object.fromEntries(components.map(({ name, line, column }) => [name, { line, column }])),
		).toEqual({
			Lite: { line: 2, column: 0 },
			App: { line: 5, column: 7 },
		});

		expect(uniqueMetadata(output.hooks)).toEqual([
			expect.objectContaining({
				id: `${components.find(({ name }) => name === 'App')!.id}#hook:0`,
				componentId: components.find(({ name }) => name === 'App')!.id,
				name: 'useState',
				kind: 'useState',
				file: '/src/App.tsrx',
				line: 6,
				column: 17,
				index: 0,
			}),
		]);
	});

	it('registers a webpack HMR replacement after the hot handoff', () => {
		const output = inspectProfileOutput(
			compile(SOURCE, '/src/App.tsrx', { hmr: 'webpack', profile: true }).code,
		);
		const handoff = callStart(output.ast, 'accept');
		const appRegistrations = output.components
			.filter(({ binding }) => binding === 'App')
			.map(({ start }) => start);

		expect(handoff).toBeTypeOf('number');
		expect(Math.max(...appRegistrations)).toBeGreaterThan(handoff!);
	});

	it('registers a declaration before top-level code can render it', () => {
		const source = `
import { createRoot } from 'octane';
export function App() @{ <main>ready</main> }
createRoot(document.body).render(App);
`;
		const output = inspectProfileOutput(
			compile(source, '/src/entry.tsrx', { hmr: false, profile: true }).code,
		);
		const render = callStart(output.ast, 'render');
		const firstRegistration = Math.min(
			...output.components.filter(({ binding }) => binding === 'App').map(({ start }) => start),
		);

		expect(render).toBeTypeOf('number');
		expect(firstRegistration).toBeLessThan(render!);
	});

	it('adds the same hook metadata in the plain TS/JS slot pass', () => {
		const source =
			"import { useState as state } from 'octane';\n" +
			'export function useCount() { const [count] = state(0); return count; }\n';
		expect(slotHooks(source, '/src/use-count.ts', { profile: false })).toEqual(
			slotHooks(source, '/src/use-count.ts'),
		);

		const output = inspectProfileOutput(
			slotHooks(source, '/src/use-count.ts', { profile: true })!.code,
		);
		expect(output.profileImports).toEqual(new Set(['__profileHook']));
		expect(uniqueMetadata(output.hooks)).toEqual([
			expect.objectContaining({
				id: '/src/use-count.ts#useCount@2:7#hook:0',
				componentId: '/src/use-count.ts#useCount@2:7',
				name: 'state',
				kind: 'useState',
				file: '/src/use-count.ts',
				line: 2,
				column: 45,
				index: 0,
			}),
		]);
	});

	it('discovers components across supported JavaScript authoring shapes', () => {
		const source = `
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
		const output = inspectProfileOutput(
			compile(source, '/src/generic.tsx', { profile: true }).code,
		);
		const components = uniqueMetadata(output.components);

		expect(components.map(({ name }) => name).sort()).toEqual(
			[
				'Arrow',
				'Conditional',
				'Expression',
				'LocalArray',
				'Memoed',
				'Nested',
				'NullOnly',
				'Outer',
				'Primitive',
				'UsesNonJsx',
				'default',
			].sort(),
		);
		for (const metadata of components) expectValidComponent(metadata, '/src/generic.tsx');

		const memoHook = uniqueMetadata(output.hooks).find(({ name }) => name === 'useState')!;
		expect(memoHook.componentId).toBe(components.find(({ name }) => name === 'Memoed')!.id);
	});

	it('distinguishes same-named nested component definitions', () => {
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
		const output = inspectProfileOutput(
			compile(source, '/src/collision.tsx', { profile: true }).code,
		);
		const same = uniqueMetadata(output.components).filter(({ name }) => name === 'Same');
		const owners = uniqueMetadata(output.hooks).map(({ componentId }) => componentId);

		expect(same).toHaveLength(2);
		expect(new Set(same.map(({ id }) => id)).size).toBe(2);
		expect(new Set(owners)).toEqual(new Set(same.map(({ id }) => id)));
	});

	it('attributes transformed parallel use() work to the component definition', () => {
		const source = `import { use } from 'octane';
export function AsyncValue(props) @{
	const value = use(props.load());
	<p>{value as string}</p>
}`;
		const output = inspectProfileOutput(
			compile(source, '/src/parallel.tsrx', { profile: true }).code,
		);
		const component = uniqueMetadata(output.components).find(({ name }) => name === 'AsyncValue')!;

		expect(uniqueMetadata(output.hooks).map(({ componentId }) => componentId)).toContain(
			component.id,
		);
	});

	it.each([
		[
			'anonymous default',
			'/src/anonymous.tsx',
			'export default function () { return null; }',
			'default',
		],
		[
			'default identifier',
			'/src/default.tsx',
			`const Text = () => 'hi'; export default Text;`,
			'Text',
		],
		[
			'default alias',
			'/src/default-alias.tsx',
			`const Empty = () => null; export { Empty as default };`,
			'Empty',
		],
	])('discovers a primitive-returning %s component', (_case, file, source, name) => {
		const components = uniqueMetadata(
			inspectProfileOutput(compile(source, file, { profile: true }).code).components,
		);
		expect(components).toHaveLength(1);
		expect(components[0]).toMatchObject({ name, file, kind: 'component' });
	});
});
