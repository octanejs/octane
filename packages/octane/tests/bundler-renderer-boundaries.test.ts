import { beforeEach, describe, expect, it, vi } from 'vitest';

const compilerMocks = vi.hoisted(() => ({
	compile: vi.fn((_code: string, _filename: string, _options: Record<string, unknown>) => ({
		code: 'compiled',
		map: null,
	})),
}));

vi.mock('../src/compiler/compile.js', () => ({
	compile: compilerMocks.compile,
	isVoidJsxCodeBlockFunction: () => false,
}));

import { createOctaneCompiler } from '../src/compiler/bundler.js';

const BOUNDARIES = {
	'/src/object-boundaries.js': {
		Canvas: {
			ownerRenderer: 'dom',
			childRenderer: 'object',
			prop: 'children',
		},
	},
};

describe('bundler renderer-boundary compiler input', () => {
	beforeEach(() => {
		compilerMocks.compile.mockClear();
	});

	it('passes normalized boundaries with both universal and DOM-owned templates', () => {
		const compiler = createOctaneCompiler({
			root: '/project',
			hmr: false,
			renderers: {
				registry: { object: '/src/object-renderer.js' },
				boundaries: BOUNDARIES,
				rules: [{ include: 'src/**/*.object.tsrx', renderer: 'object' }],
			},
		});

		compiler.transform('export function Scene() @{ <node /> }', '/project/src/Scene.object.tsrx');
		const universalOptions = compilerMocks.compile.mock.calls.at(-1)?.[2];
		expect(universalOptions).toMatchObject({
			renderer: {
				id: 'object',
				module: '/src/object-renderer.js',
				target: 'universal',
			},
			rendererBoundaries: BOUNDARIES,
		});

		compiler.transform('export function App() @{ <main /> }', '/project/src/App.tsrx');
		const domOptions = compilerMocks.compile.mock.calls.at(-1)?.[2];
		expect(domOptions).toMatchObject({ rendererBoundaries: BOUNDARIES });
		expect(domOptions).not.toHaveProperty('renderer');
	});

	it('keeps the default DOM compiler call free of boundary metadata', () => {
		const compiler = createOctaneCompiler({ root: '/project', hmr: false });

		compiler.transform('export function App() @{ <main /> }', '/project/src/App.tsrx');
		const options = compilerMocks.compile.mock.calls.at(-1)?.[2];
		expect(options).not.toHaveProperty('renderer');
		expect(options).not.toHaveProperty('rendererBoundaries');
	});
});
