// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { resolveOctaneConfig } from '@octanejs/app-core/config';
import { resolveRendererForFile } from 'octane/compiler/renderers';

describe('app renderer configuration', () => {
	it('normalizes the experimental compiler seam while preserving the DOM default', () => {
		const dom = resolveOctaneConfig({});
		expect(resolveRendererForFile(dom.compiler.renderers, '/src/App.tsrx').id).toBe('dom');

		const config = resolveOctaneConfig({
			compiler: {
				renderers: {
					registry: { object: '@octanejs/object-renderer' },
					rules: [{ include: '**/*.object.tsrx', renderer: 'object' }],
				},
			},
		});
		expect(resolveRendererForFile(config.compiler.renderers, '/src/Card.object.tsrx')).toEqual({
			id: 'object',
			module: '@octanejs/object-renderer',
			target: 'universal',
		});
		// Production re-resolution receives an already-normalized config.
		expect(resolveOctaneConfig(config).compiler.renderers.signature).toBe(
			config.compiler.renderers.signature,
		);
	});

	it('surfaces renderer diagnostics at the shared config boundary', () => {
		expect(() =>
			resolveOctaneConfig({
				compiler: {
					renderers: {
						registry: { object: '@octanejs/object-renderer' },
						rules: [{ include: '**/*.object.tsrx', renderer: 'missing' }],
					},
				},
			}),
		).toThrow(/rules\[0\]\.renderer references unknown renderer "missing"/);
	});
});
