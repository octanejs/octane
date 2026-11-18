// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { compile } from 'octane/compiler';

const renderer = {
	id: 'native',
	module: '@test/writer',
	target: 'valdi',
	server: 'unsupported',
	text: 'host',
	capabilities: ['host-text-site', 'component-runtime'],
} as const;

describe('Valdi deferred child ownership', () => {
	it.each([
		[
			'component children',
			'import { useState } from "octane";',
			'<Child><label value={useState(0)[0]} /></Child>',
		],
		[
			'JSX-valued props',
			'import { useContext as read } from "octane";',
			'<Child fallback={<label value={read(ctx)} />} />',
		],
		[
			'custom hooks',
			'function useValue() { return 1; }',
			'<Child><label value={useValue()} /></Child>',
		],
		[
			'synchronously invoked closures',
			'import { useState } from "octane";',
			'<Child><label value={(() => useState(0)[0])()} /></Child>',
		],
		[
			'context hook members',
			'const hooks = { useContext: () => 1 };',
			'<Child><label value={hooks.useContext()} /></Child>',
		],
	])('rejects parent hooks inside deferred %s', (_, setup, jsx) => {
		const source = `${setup} import { Child } from './child'; export function Scene({ctx}) @{ ${jsx} }`;
		expect(() => compile(source, '/src/Scene.tsrx', { renderer, hmr: false })).toThrow(
			/hooks inside deferred children/,
		);
	});

	it('keeps parent hooks evaluated before creating children', () => {
		const source = `import { useState } from 'octane'; import { Child } from './child';
		export function Scene() @{ const [value] = useState(0); <Child><label value={value} /></Child> }`;
		expect(compile(source, '/src/Scene.tsrx', { renderer, hmr: false }).diagnostics).toEqual([]);
	});

	it('does not classify ordinary runtime APIs as hooks', () => {
		const source = `import { flushSync } from 'octane'; import { Child } from './child';
		export function Scene() @{ <Child><label value={flushSync(() => 1)} /></Child> }`;
		expect(compile(source, '/src/Scene.tsrx', { renderer, hmr: false }).diagnostics).toEqual([]);
	});

	it('keeps aliased context reads exempt from slot restrictions in keyed loops', () => {
		const source = `import { useContext as useTheme } from 'octane';
		export function Scene({ctx, items}) @{ @for (const item of items; key item.id) { <label value={useTheme(ctx)} /> } }`;
		expect(compile(source, '/src/Scene.tsrx', { renderer, hmr: false }).diagnostics).toEqual([]);
	});
});
