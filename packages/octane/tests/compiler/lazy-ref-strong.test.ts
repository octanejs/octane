import { describe, expect, it } from 'vitest';
import { compile } from '../../src/compiler/compile.js';
import { compileToVolarMappings } from '../../src/compiler/volar.js';

// Every Strong error the editor publishes for a module.
function errors(source: string) {
	return compileToVolarMappings(source, '/src/App.tsx', { strong: true })
		.diagnostics.filter((diagnostic) => diagnostic.severity === 'error')
		.map((diagnostic) => diagnostic.code);
}

describe('Strong lazy ref factories and ownership', () => {
	for (const mode of ['client', 'server'] as const) {
		for (const dev of [true, false]) {
			it(`rejects scheduling in an initializer in ${mode}, dev=${dev}`, () => {
				const source = `import { useLazyRef } from 'octane';
					export function App() {
						useLazyRef(() => { queueMicrotask(() => {}); return {}; });
						return <div />;
					}`;
				expect(() => compile(source, '/src/App.tsx', { mode, dev, strong: true })).toThrow(
					'OCTANE_STRONG_RENDER_SIDE_EFFECT',
				);
			});
			it(`rejects scheduling in a literal-spread initializer in ${mode}, dev=${dev}`, () => {
				const source = `import { useLazyRef } from 'octane';
					export function App() {
						useLazyRef(...[() => { queueMicrotask(() => {}); return {}; }]);
						return <div />;
					}`;
				expect(() => compile(source, '/src/App.tsx', { mode, dev, strong: true })).toThrow(
					'OCTANE_STRONG_RENDER_SIDE_EFFECT',
				);
			});
		}
	}

	it('does not analyze an ordinary function-valued ref as an initializer', () => {
		const source = `import { useRef } from 'octane';
			export function App() { useRef(() => queueMicrotask(() => {})); return <div />; }`;
		expect(() => compile(source, '/src/App.tsx', { strong: true })).not.toThrow();
	});

	it.each([
		['clock', 'return Date.now();'],
		['randomness', 'return Math.random();'],
		['random ID', 'return crypto.randomUUID();'],
		['browser state', 'return localStorage.getItem("key");'],
	])('lets the factory read %s like a lazy state initializer', (_, body) => {
		for (const hook of ['useState', 'useLazyRef']) {
			const source = `import { ${hook} } from 'octane';
				export function App() { ${hook}(() => { ${body} }); return <div />; }`;
			expect(() => compile(source, '/src/App.tsx', { strong: true })).not.toThrow();
		}
	});

	it('still rejects clock reads in ordinary render code beside the factory', () => {
		const source = `import { useLazyRef } from 'octane';
			export function App() { useLazyRef(() => Date.now()); const now = Date.now(); return <div />; }`;
		expect(errors(source)).toEqual(['OCTANE_STRONG_RENDER_IMPURE_CALL']);
	});

	it('checks a literal-spread factory once, as render-time work', () => {
		const source = `import { useLazyRef, useState } from 'octane';
			export function App() {
				const [items] = useState([]);
				useLazyRef(...[() => { items.push(1); return 1; }]);
				return <div />;
			}`;
		expect(errors(source)).toEqual(['OCTANE_STRONG_RENDER_SNAPSHOT_MUTATION']);
	});

	it.each([
		['useState initializer', 'useState(...[() => { queueMicrotask(() => {}); return 1; }])'],
		[
			'useReducer initializer',
			'useReducer(...[(state) => state, 0, () => { queueMicrotask(() => {}); return 1; }])',
		],
		[
			'useLinkedState reconciler',
			'useLinkedState(...[props.value, () => { queueMicrotask(() => {}); return 1; }])',
		],
	])('checks a %s passed through a literal spread', (_, call) => {
		const source = `import { useLinkedState, useReducer, useState } from 'octane';
			export function App(props) { ${call}; return <div />; }`;
		expect(errors(source)).toEqual(['OCTANE_STRONG_RENDER_SIDE_EFFECT']);
	});

	it('checks a reducer passed through a literal spread as a replayed callback', () => {
		const source = `import { useReducer } from 'octane';
			export function App() {
				useReducer(...[(state) => { queueMicrotask(() => {}); return state; }, 0]);
				return <div />;
			}`;
		expect(errors(source)).toEqual(['OCTANE_STRONG_IMPURE_UPDATER']);
	});

	it('leaves an opaque spread factory unanalyzed', () => {
		const source = `import { useLazyRef } from 'octane';
			export function App(props) { useLazyRef(...props.args); return <div />; }`;
		expect(errors(source)).toEqual([]);
	});

	it.each([
		[
			'aliased import',
			"import { useLazyRef as ref } from 'octane';",
			'ref(() => { queueMicrotask(() => {}); return 1; });',
		],
		[
			'namespace',
			"import * as Octane from 'octane';",
			'Octane.useLazyRef(() => { queueMicrotask(() => {}); return 1; });',
		],
	])('checks a synchronous factory through %s', (_, imports, call) => {
		const source = `${imports} export function App() { ${call} return <div />; }`;
		expect(() => compile(source, '/src/App.tsx', { strong: true })).toThrow(
			'OCTANE_STRONG_RENDER_SIDE_EFFECT',
		);
	});

	it.each([
		['read', 'const value = ref.current;', 'OCTANE_STRONG_RENDER_REF_READ'],
		['write', 'ref.current = 2;', 'OCTANE_STRONG_RENDER_REF_WRITE'],
	])('applies ref ownership to render-time %s', (_, action, diagnostic) => {
		const source = `import { useLazyRef } from 'octane';
			export function App() { const ref = useLazyRef(() => 1); ${action} return <div />; }`;
		expect(() => compile(source, '/src/App.tsx', { strong: true })).toThrow(diagnostic);
	});

	it('permits value and element ref access in effects', () => {
		const imports = `import { useLazyRef, useEffect } from 'octane';`;
		const valueRef = `${imports} export function App(props) @{
			const store = useLazyRef(() => new Map());
			useEffect(() => { store.current.set(props.id, props.value); props.log(store.current.size); });
			<div />
		}`;
		const elementRef = `${imports} export function App() @{
			const ref = useLazyRef(() => null);
			useEffect(() => { ref.current?.focus(); });
			<div {ref} />
		}`;
		expect(() => compile(valueRef, '/src/App.tsrx', { strong: true })).not.toThrow();
		expect(() => compile(elementRef, '/src/App.tsrx', { strong: true })).not.toThrow();
	});
});
