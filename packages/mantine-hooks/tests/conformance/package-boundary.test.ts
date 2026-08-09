// @vitest-environment node

import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve, sep } from 'node:path';
import { build } from 'esbuild';
import { describe, expect, it } from 'vitest';

const packageDirectory = resolve(import.meta.dirname, '../..');
const require = createRequire(import.meta.url);
const { JSDOM } = require('jsdom') as {
	JSDOM: new (
		markup: string,
		options: { pretendToBeVisual: boolean; runScripts: 'dangerously'; url: string },
	) => {
		window: Window & {
			counterResult?: { count: string; element: string };
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

describe('@octanejs/mantine-hooks production package boundary', () => {
	it('classifies its authored hook modules as side-effect-free', () => {
		const manifest = JSON.parse(readFileSync(resolve(packageDirectory, 'package.json'), 'utf8'));

		expect(manifest.sideEffects).toBe(false);
	});

	it('executes the public counter without retaining unrelated storage hooks', async () => {
		const component = compile(
			`
import { useCounter } from '@octanejs/mantine-hooks';

export function Counter() @{
	const [count, actions] = useCounter(2, { min: 0, max: 3 });
	<button id="counter" onClick={() => actions.set(3)}>{count as string}</button>
}
`,
			'public-mantine-counter.tsrx',
			{ dev: false, hmr: false },
		).code;
		const result = await build({
			stdin: {
				contents: `${component}
import { createRoot } from 'octane';

const container = document.createElement('main');
document.body.appendChild(container);
const root = createRoot(container);
root.render(Counter);
const button = container.querySelector('#counter');
globalThis.counterResult = { count: button.textContent, element: button.tagName };
root.unmount();
`,
				resolveDir: packageDirectory,
				sourcefile: 'public-mantine-counter-consumer.js',
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
				count: '2',
				element: 'BUTTON',
			});
		} finally {
			dom.window.close();
		}

		const includedModules = Object.keys(Object.values(result.metafile!.outputs)[0].inputs).map(
			(module) => module.split(sep).join('/'),
		);

		expect(
			includedModules.filter(
				(module) =>
					module.includes('/use-local-storage/') || module.includes('/use-session-storage/'),
			),
		).toEqual([]);
	});
});
