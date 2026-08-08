// @vitest-environment node

import { createRequire } from 'node:module';
import { resolve, sep } from 'node:path';
import { build } from 'esbuild';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { compile } = require('octane/compiler') as {
	compile(
		source: string,
		filename: string,
		options: { dev: boolean; hmr: boolean; profile: boolean },
	): { code: string };
};
const { JSDOM } = require('jsdom') as {
	JSDOM: new (
		html: string,
		options: { runScripts: 'outside-only' },
	) => {
		window: Window &
			typeof globalThis & {
				__OCTANE_DEVTOOLS__?: { getTree(): Array<{ name: string }> };
			};
	};
};

async function buildCustomEsbuildApp(profile: boolean) {
	const source = compile(
		`import { createRoot } from 'octane';
		function ProfileConsumer() @{
			<button id="profile-consumer">{'ready'}</button>
		}
		createRoot(document.getElementById('app')).render(ProfileConsumer);`,
		'custom-esbuild-profile.tsrx',
		{ dev: false, hmr: false, profile },
	).code;
	const result = await build({
		stdin: {
			contents: source,
			loader: 'js',
			resolveDir: resolve(import.meta.dirname, '..'),
			sourcefile: 'custom-esbuild-profile.js',
		},
		bundle: true,
		define: {
			'process.env.NODE_ENV': JSON.stringify('production'),
			__OCTANE_PROFILE_ENABLED__: JSON.stringify(profile),
		},
		format: 'iife',
		logLevel: 'silent',
		metafile: true,
		minify: true,
		platform: 'browser',
		target: 'esnext',
		treeShaking: true,
		write: false,
	});
	const output = result.outputFiles[0];
	const retainedInputs = Object.entries(Object.values(result.metafile.outputs)[0].inputs)
		.filter(([, metadata]) => metadata.bytesInOutput > 0)
		.map(([input]) => input.split(sep).join('/'));
	const dom = new JSDOM('<!doctype html><div id="app"></div>', {
		runScripts: 'outside-only',
	});
	dom.window.eval(output.text);

	return {
		dom,
		retainedInputs,
	};
}

describe('custom esbuild production profiling', () => {
	it('keeps instrumentation out of normal production apps while preserving an explicit profiling build', async () => {
		const normal = await buildCustomEsbuildApp(false);
		const profiled = await buildCustomEsbuildApp(true);

		expect(normal.dom.window.document.querySelector('#profile-consumer')?.textContent).toBe(
			'ready',
		);
		expect(profiled.dom.window.document.querySelector('#profile-consumer')?.textContent).toBe(
			'ready',
		);
		expect(normal.dom.window.__OCTANE_DEVTOOLS__).toBeUndefined();
		expect(profiled.dom.window.__OCTANE_DEVTOOLS__?.getTree()).toEqual([
			expect.objectContaining({ name: 'ProfileConsumer' }),
		]);

		for (const optionalModule of ['/src/profiling.ts', '/src/devtools-hook.ts']) {
			expect(normal.retainedInputs.some((input) => input.endsWith(optionalModule))).toBe(false);
			expect(profiled.retainedInputs.some((input) => input.endsWith(optionalModule))).toBe(true);
		}
	});
});
