// @vitest-environment node

import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import { build, transform } from 'esbuild';
import { describe, expect, it } from 'vitest';
// @ts-expect-error This shared JavaScript build helper has no declaration file.
import { createOctaneSourcePlugin } from '../../../scripts/packed-source-compiler.mjs';

const require = createRequire(import.meta.url);
const { JSDOM } = require('jsdom') as {
	JSDOM: new (
		markup: string,
		options: { runScripts: 'dangerously'; pretendToBeVisual: boolean },
	) => { window: Window & typeof globalThis & { eval(source: string): void; close(): void } };
};
const packageDirectory = resolve(import.meta.dirname, '..');
const consumerEntry = resolve(import.meta.dirname, '_fixtures/production-bundle-consumer.ts');

async function runBrowserBundle(mode: 'development' | 'production') {
	const result = await build({
		entryPoints: [consumerEntry],
		plugins: [await createOctaneSourcePlugin(packageDirectory)],
		bundle: true,
		define: {
			__OCTANE_PROFILE_ENABLED__: 'false',
			'process.env.NODE_ENV': JSON.stringify(mode),
		},
		format: 'iife',
		logLevel: 'silent',
		minify: true,
		platform: 'browser',
		treeShaking: true,
		write: false,
	});
	const browser = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
		runScripts: 'dangerously',
		pretendToBeVisual: true,
	});
	const errors: string[] = [];

	try {
		browser.window.console.error = (...args: unknown[]) => errors.push(args.map(String).join(' '));
		expect('process' in browser.window).toBe(false);
		browser.window.eval(result.outputFiles[0].text);
		expect(browser.window.document.querySelector('main')?.textContent).toBe('stray');
		return { errors, code: result.outputFiles[0].text };
	} finally {
		browser.window.close();
	}
}

describe('@octanejs/seo browser bundles', () => {
	it('reports stray <Head> owners in a development bundle without process', async () => {
		expect((await runBrowserBundle('development')).errors.join('\n')).toContain(
			'Wrap the app in a single',
		);
	}, 30_000);

	it('stays silent in a production bundle without process', async () => {
		const { errors, code } = await runBrowserBundle('production');
		expect(errors).toEqual([]);
		expect(code).not.toContain('Two <Head> elements are mounted');
	}, 30_000);

	it('does not throw when an unbundled browser host has no process', async () => {
		const source = readFileSync(
			resolve(packageDirectory, 'src/useStrayOwnerDiagnostic.ts'),
			'utf8',
		);
		const compiled = await transform(source, { format: 'cjs', loader: 'ts' });
		const module: { exports: { useStrayOwnerDiagnostic?: (owns: boolean) => void } } = {
			exports: {},
		};

		runInNewContext(compiled.code, {
			exports: module.exports,
			module,
			require: (name: string) => {
				if (name !== 'octane') throw new Error(`Unexpected import: ${name}`);
				return {
					useEffect: () => {
						throw new Error('An unbundled host cannot schedule this diagnostic.');
					},
				};
			},
		});

		expect(() => module.exports.useStrayOwnerDiagnostic!(true)).not.toThrow();
	});
});
