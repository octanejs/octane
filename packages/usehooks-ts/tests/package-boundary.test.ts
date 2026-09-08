/// <reference types="node" />
// @vitest-environment node

import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve, sep } from 'node:path';
import { build } from 'esbuild';
import { describe, expect, it } from 'vitest';

const packageDirectory = resolve(import.meta.dirname, '..');
const require = createRequire(import.meta.url);
const { JSDOM } = require('jsdom') as {
	JSDOM: new (
		markup: string,
		options: { pretendToBeVisual: boolean; runScripts: 'dangerously'; url: string },
	) => {
		window: Window & {
			counterResult?: { before: string; after: string };
			eval(source: string): unknown;
			close(): void;
		};
	};
};
const { compile } = require('octane/compiler') as {
	compile: (
		source: string,
		filename: string,
		options: { dev: boolean; hmr: boolean },
	) => {
		code: string;
	};
};
const { createOctaneCompiler } = require('octane/compiler/bundler') as {
	createOctaneCompiler: (options: { root: string }) => {
		transform: (
			source: string,
			filename: string,
			options: { dev: boolean; hmr: boolean },
		) => { code: string; kind: string } | null;
	};
};

describe('@octanejs/usehooks-ts production package boundary', () => {
	it('classifies its authored state, timing, and lifecycle hooks as side-effect-free', () => {
		const manifest = JSON.parse(readFileSync(resolve(packageDirectory, 'package.json'), 'utf8'));

		expect(manifest.sideEffects).toBe(false);
	});

	it('executes the public counter without retaining unrelated debouncing hooks', async () => {
		const compiler = createOctaneCompiler({ root: packageDirectory });
		const component = compile(
			`
import { useCounter } from '@octanejs/usehooks-ts';

export function Counter() @{
	const counter = useCounter(4);
	<button id="counter" onClick={counter.increment}>{counter.count as string}</button>
}
`,
			'public-usehooks-counter.tsrx',
			{ dev: false, hmr: false },
		).code;
		const result = await build({
			stdin: {
				contents: `${component}
import { createRoot, flushSync } from 'octane';

const container = document.createElement('main');
document.body.appendChild(container);
const root = createRoot(container);
root.render(Counter);
const button = container.querySelector('#counter');
globalThis.counterResult = { before: button.textContent };
flushSync(() => button.click());
globalThis.counterResult.after = button.textContent;
root.unmount();
`,
				resolveDir: packageDirectory,
				sourcefile: 'public-usehooks-counter-consumer.js',
			},
			bundle: true,
			define: {
				__OCTANE_PROFILE_ENABLED__: 'false',
				'process.env.NODE_ENV': JSON.stringify('production'),
			},
			format: 'iife',
			logLevel: 'silent',
			metafile: true,
			minify: true,
			platform: 'browser',
			plugins: [
				{
					name: 'octane-authored-dependencies',
					setup(builder) {
						// Published bindings ship authored source. Apply the same manifest-aware
						// transform used by Octane bundler integrations before esbuild lowers it.
						builder.onLoad({ filter: /\.[jt]s$/ }, ({ path: filename }) => {
							const transformed = compiler.transform(readFileSync(filename, 'utf8'), filename, {
								dev: false,
								hmr: false,
							});
							if (transformed === null || transformed.kind === 'none') return null;
							return {
								contents: transformed.code,
								loader: filename.endsWith('.ts') ? 'ts' : 'js',
							};
						});
					},
				},
			],
			treeShaking: true,
			write: false,
		});
		const dom = new JSDOM('<!doctype html><html><body></body></html>', {
			pretendToBeVisual: true,
			runScripts: 'dangerously',
			url: 'https://octane.test/',
		});

		try {
			dom.window.eval(result.outputFiles[0].text);

			expect(JSON.parse(JSON.stringify(dom.window.counterResult))).toEqual({
				before: '4',
				after: '5',
			});
		} finally {
			dom.window.close();
		}

		const includedModules = Object.keys(Object.values(result.metafile!.outputs)[0].inputs).map(
			(module) => module.split(sep).join('/'),
		);

		expect(
			includedModules.filter((module) => module.endsWith('packages/usehooks-ts/src/timing.ts')),
		).toEqual([]);
	});
});
