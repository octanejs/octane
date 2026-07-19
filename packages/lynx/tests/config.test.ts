import { describe, expect, it } from 'vitest';
import { normalizeRendererConfig } from 'octane/compiler/renderers';
import * as authoringConfig from '../src/config.js';
import * as runtimeConfig from '../src/config.runtime.js';
import { lynxRenderers, lynxRspeedyRenderers } from '../src/config.js';

describe('@octanejs/lynx renderer preset', () => {
	it('keeps the Node-loadable runtime entry aligned with TypeScript authoring', () => {
		for (const name of [
			'LYNX_RENDERER_ID',
			'lynxRenderer',
			'lynxRendererRegistry',
			'lynxRendererRules',
			'lynxRenderers',
			'lynxRspeedyRenderers',
			'renderers',
			'default',
		] as const) {
			expect(runtimeConfig[name]).toEqual(authoringConfig[name]);
		}
	});

	it('selects the host-text universal target for .lynx.tsrx modules', () => {
		const config = normalizeRendererConfig(lynxRenderers);

		expect(config.registry.lynx).toEqual({
			module: '@octanejs/lynx/renderer',
			target: 'universal',
			server: 'unsupported',
			intrinsics: '@octanejs/lynx/intrinsics',
			text: 'host',
			capabilities: ['visibility'],
			validation: expect.objectContaining({
				textParents: ['text'],
				forbiddenGlobals: expect.arrayContaining([
					'document',
					'HTMLElement',
					'queueMicrotask',
					'structuredClone',
					'window',
				]),
				forbiddenImports: expect.arrayContaining([
					'@lynx-js/react',
					'octane/hydration',
					'preact',
					'react',
				]),
				hostProps: expect.objectContaining({
					'*': expect.arrayContaining(['ref', 'className', 'data-*', 'bind*']),
					text: expect.arrayContaining(['text-maxline']),
					view: [],
				}),
			}),
		});
		expect(config.boundaries).toEqual({});
		expect(config.rules).toEqual([{ include: ['**/*.lynx.tsrx'], exclude: [], renderer: 'lynx' }]);
		expect(normalizeRendererConfig(lynxRspeedyRenderers).default).toBe('lynx');
	});
});
