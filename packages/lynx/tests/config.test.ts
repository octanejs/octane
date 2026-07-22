import { describe, expect, it } from 'vitest';
import { normalizeRendererConfig } from 'octane/compiler/renderers';
import * as authoringConfig from '../src/config.js';
import * as runtimeConfig from '../src/config.runtime.js';
import {
	lynxRenderers,
	lynxRspeedyBackgroundRenderers,
	lynxRspeedyMainThreadRenderers,
	lynxRspeedyRenderers,
} from '../src/config.js';

describe('@octanejs/lynx renderer preset', () => {
	it('keeps the Node-loadable runtime entry aligned with TypeScript authoring', () => {
		for (const name of [
			'LYNX_RENDERER_ID',
			'lynxBackgroundRenderer',
			'lynxBackgroundRendererRegistry',
			'lynxMainThreadRenderer',
			'lynxMainThreadRendererRegistry',
			'lynxRenderer',
			'lynxRendererRegistry',
			'lynxRendererRules',
			'lynxRenderers',
			'lynxRspeedyBackgroundRenderers',
			'lynxRspeedyMainThreadRenderers',
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
			capabilities: ['class-name-alias', 'thread-functions', 'visibility'],
			validation: expect.objectContaining({
				textHosts: ['raw-text'],
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
		expect(lynxRspeedyRenderers).toBe(lynxRspeedyBackgroundRenderers);
	});

	it('keeps Native Modules and platform APIs on the background thread', () => {
		expect(
			normalizeRendererConfig(lynxRspeedyBackgroundRenderers).registry.lynx.validation,
		).toMatchObject({
			forbiddenGlobals: expect.not.arrayContaining(['NativeModules']),
			forbiddenImports: expect.not.arrayContaining(['@octanejs/lynx/platform']),
		});
	});

	it('marks Native Modules and platform imports as main-thread violations', () => {
		const background = lynxRspeedyBackgroundRenderers.registry.lynx.validation;
		const mainThread = lynxRspeedyMainThreadRenderers.registry.lynx.validation;
		expect(
			normalizeRendererConfig(lynxRspeedyMainThreadRenderers).registry.lynx.validation,
		).toMatchObject({
			forbiddenGlobals: expect.arrayContaining(['NativeModules']),
			forbiddenImports: expect.arrayContaining(['@octanejs/lynx/platform']),
		});
		expect(mainThread.forbiddenGlobals.filter((name) => name !== 'NativeModules')).toEqual(
			background.forbiddenGlobals,
		);
		expect(
			mainThread.forbiddenImports.filter((name) => name !== '@octanejs/lynx/platform'),
		).toEqual(background.forbiddenImports);
		expect(mainThread.hostProps).toBe(background.hostProps);
	});
});
