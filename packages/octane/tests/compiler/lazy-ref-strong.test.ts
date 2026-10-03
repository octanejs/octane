import { describe, expect, it } from 'vitest';
import { compile } from '../../src/compiler/compile.js';

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
		['clock', 'return Date.now();', 'OCTANE_STRONG_RENDER_IMPURE_CALL'],
		['randomness', 'return Math.random();', 'OCTANE_STRONG_RENDER_IMPURE_CALL'],
		[
			'DOM mutation',
			'document.body.append(document.createElement("p")); return 1;',
			'OCTANE_STRONG_RENDER_AMBIENT_READ',
		],
	])('applies render purity rules to %s in the factory', (_, body, diagnostic) => {
		const source = `import { useLazyRef } from 'octane';
			export function App() { useLazyRef(() => { ${body} }); return <div />; }`;
		expect(() => compile(source, '/src/App.tsx', { strong: true })).toThrow(diagnostic);
	});

	it('applies render purity rules to a literal-spread factory', () => {
		const source = `import { useLazyRef } from 'octane';
			export function App() { useLazyRef(...[() => Date.now()]); return <div />; }`;
		expect(() => compile(source, '/src/App.tsx', { strong: true })).toThrow(
			'OCTANE_STRONG_RENDER_IMPURE_CALL',
		);
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

	it('checks value-ref reads in effects and permits an attached element ref', () => {
		const imports = `import { useLazyRef, useEffect } from 'octane';`;
		const valueRef = `${imports} export function App(props) @{
			const ref = useLazyRef(() => 1);
			useEffect(() => { props.log(ref.current); });
			<div />
		}`;
		const elementRef = `${imports} export function App() @{
			const ref = useLazyRef(() => null);
			useEffect(() => { ref.current?.focus(); });
			<div {ref} />
		}`;
		expect(() => compile(valueRef, '/src/App.tsrx', { strong: true })).toThrow(
			'OCTANE_STRONG_EFFECT_HIDDEN_DEPENDENCY',
		);
		expect(() => compile(elementRef, '/src/App.tsrx', { strong: true })).not.toThrow();
	});
});
