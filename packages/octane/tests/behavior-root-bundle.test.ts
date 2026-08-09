// @vitest-environment node

import { resolve, sep } from 'node:path';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';
import { describe, expect, it } from 'vitest';

async function bundleConsumer(contents: string) {
	const result = await build({
		stdin: {
			contents,
			loader: 'ts',
			resolveDir: resolve(import.meta.dirname, '..'),
			sourcefile: 'behavior-consumer.ts',
		},
		bundle: true,
		define: { 'process.env.NODE_ENV': JSON.stringify('production') },
		format: 'esm',
		logLevel: 'silent',
		metafile: true,
		minify: true,
		platform: 'browser',
		target: 'esnext',
		treeShaking: true,
		write: false,
	});

	return {
		contents: result.outputFiles[0].contents,
		inputs: Object.entries(Object.values(result.metafile.outputs)[0].inputs)
			.filter(([, metadata]) => metadata.bytesInOutput > 0)
			.map(([input]) => input.split(sep).join('/')),
	};
}

describe('production behavior-root entry points', () => {
	for (const entry of ['octane', 'octane/behavior']) {
		it(`${entry} attaches behavior without retaining a renderer`, async () => {
			const bundle = await bundleConsumer(`export { attachBehaviorRoot } from '${entry}';`);
			const { attachBehaviorRoot } = (await import(
				`data:text/javascript;base64,${Buffer.from(bundle.contents).toString('base64')}`
			)) as typeof import('../src/behavior-root.js');
			const document = new JSDOM('<main><button>Existing</button></main>').window.document;
			const container = document.querySelector('main')!;
			const existing = container.firstElementChild;
			const root = attachBehaviorRoot(container);

			expect(container.firstElementChild).toBe(existing);
			expect(bundle.inputs).toEqual(
				expect.arrayContaining([
					expect.stringMatching(/packages\/octane\/src\/behavior-root\.ts$/),
				]),
			);
			expect(
				bundle.inputs.some((input) =>
					/\/packages\/octane\/src\/(?:runtime(?:\.server)?\.ts|compiler\/|server\/)/.test(input),
				),
			).toBe(false);

			root.dispose();
			expect(container.firstElementChild).toBe(existing);
		});
	}

	it('does not retain behavior ownership in ordinary component-root bundles', async () => {
		const bundle = await bundleConsumer("export { createRoot } from 'octane';");

		expect(bundle.inputs.some((input) => /\/behavior-root\.ts$/.test(input))).toBe(false);
	});
});
