import { describe, expect, it } from 'vitest';
import {
	DOM_RENDERER_ID,
	DOM_RENDERER_MODULE,
	normalizeRendererConfig,
	resolveRendererForFile,
} from 'octane/compiler/renderers';
import { resolveRendererForFile as resolveRendererFromBundler } from 'octane/compiler/bundler';

describe('renderer configuration', () => {
	it('keeps the existing DOM renderer as the complete default', () => {
		const config = normalizeRendererConfig();

		expect(config).toMatchObject({
			default: DOM_RENDERER_ID,
			registry: {
				dom: {
					module: DOM_RENDERER_MODULE,
					target: 'dom',
					server: 'render',
					text: 'host',
					capabilities: [],
				},
			},
			boundaries: {},
			rules: [],
		});
		expect(config.signature).toMatch(/^octane-renderers-v3:/);
		expect(resolveRendererForFile(config, '/src/App.tsrx')).toEqual({
			id: 'dom',
			module: 'octane',
			target: 'dom',
			server: 'render',
			text: 'host',
			capabilities: [],
		});
	});

	it('normalizes compiler and runtime metadata for a client-only renderer', () => {
		const config = normalizeRendererConfig({
			registry: {
				three: {
					module: '@octanejs/three/renderer',
					server: 'client-only',
					intrinsics: '@octanejs/three/intrinsics',
					text: 'ignore',
					capabilities: ['visibility', 'local-host-callback', 'visibility'],
				},
			},
			boundaries: {
				'@octanejs/three': {
					Canvas: {
						ownerRenderer: 'dom',
						childRenderer: 'three',
						prop: 'children',
						server: 'omit-child',
					},
				},
			},
			rules: [{ include: '**/*.three.tsrx', renderer: 'three' }],
		});

		expect(config.registry.three).toEqual({
			module: '@octanejs/three/renderer',
			target: 'universal',
			server: 'client-only',
			intrinsics: '@octanejs/three/intrinsics',
			text: 'ignore',
			capabilities: ['local-host-callback', 'visibility'],
		});
		expect(config.boundaries['@octanejs/three'].Canvas.server).toBe('omit-child');
		expect(Object.isFrozen(config.registry.three.capabilities)).toBe(true);
		expect(resolveRendererForFile(config, '/src/Scene.three.tsrx')).toEqual({
			id: 'three',
			...config.registry.three,
		});
		expect(normalizeRendererConfig(config).signature).toBe(config.signature);
	});

	it('normalizes renderer-owned child regions by stable module and export identity', () => {
		const config = normalizeRendererConfig({
			registry: { three: '@octanejs/three/renderer' },
			boundaries: {
				'@octanejs/three': {
					Html: {
						ownerRenderer: 'three',
						childRenderer: 'dom',
						prop: 'children',
					},
					Canvas: {
						ownerRenderer: 'dom',
						childRenderer: 'three',
						prop: 'children',
					},
				},
			},
		});

		expect(config.boundaries).toEqual({
			'@octanejs/three': {
				Canvas: {
					ownerRenderer: 'dom',
					childRenderer: 'three',
					prop: 'children',
				},
				Html: {
					ownerRenderer: 'three',
					childRenderer: 'dom',
					prop: 'children',
				},
			},
		});
		expect(Object.isFrozen(config.boundaries)).toBe(true);
		expect(Object.isFrozen(config.boundaries['@octanejs/three'])).toBe(true);
		expect(Object.isFrozen(config.boundaries['@octanejs/three'].Canvas)).toBe(true);

		const reordered = normalizeRendererConfig({
			registry: { three: '@octanejs/three/renderer' },
			boundaries: {
				'@octanejs/three': {
					Canvas: config.boundaries['@octanejs/three'].Canvas,
					Html: config.boundaries['@octanejs/three'].Html,
				},
			},
		});
		expect(reordered.signature).toBe(config.signature);
	});

	it('uses ordered first-match rules across portable module IDs', () => {
		const config = {
			registry: {
				object: { module: '@octanejs/object-renderer', target: 'universal' },
				three: '@octanejs/three/renderer',
			},
			rules: [
				{
					include: 'src/scenes/**/*.{tsrx,tsx}',
					exclude: '**/*.object.tsrx',
					renderer: 'three',
				},
				{ include: '**/*.object.tsrx', renderer: 'object' },
			],
		};

		// Both rules match, but the declaration-order winner owns ordinary scenes.
		expect(resolveRendererForFile(config, '/src/scenes/Model.tsrx')).toMatchObject({
			id: 'three',
			module: '@octanejs/three/renderer',
			target: 'universal',
		});
		// An exclusion only skips its rule; later rules still get a chance to match.
		expect(
			resolveRendererForFile(config, String.raw`\src\scenes\Model.object.tsrx?raw`),
		).toMatchObject({
			id: 'object',
			module: '@octanejs/object-renderer',
		});
		expect(resolveRendererFromBundler(config, '/src/App.tsrx').id).toBe('dom');
	});

	it('produces a stable cache signature without erasing semantic rule order', () => {
		const first = normalizeRendererConfig({
			registry: { three: '@octanejs/three/renderer', object: '/src/object-renderer.js' },
			rules: [
				{
					include: ['**/*.three.tsrx', '**/*.scene.tsrx'],
					renderer: 'three',
				},
				{ include: '**/*.object.tsrx', renderer: 'object' },
			],
		});
		const equivalent = normalizeRendererConfig({
			registry: {
				object: { module: '/src/object-renderer.js', target: 'universal' },
				three: '@octanejs/three/renderer',
			},
			rules: [
				{
					include: ['**/*.scene.tsrx', '**/*.three.tsrx'],
					renderer: 'three',
				},
				{ include: '**/*.object.tsrx', renderer: 'object' },
			],
		});
		const reordered = normalizeRendererConfig({
			registry: equivalent.registry,
			rules: [...equivalent.rules].reverse(),
		});

		expect(equivalent.signature).toBe(first.signature);
		expect(reordered.signature).not.toBe(first.signature);
	});

	it('rejects ambiguous or non-portable declarations during config loading', () => {
		expect(() =>
			normalizeRendererConfig({
				registry: { three: '@octanejs/three/renderer' },
				default: 'missing',
			}),
		).toThrow(/default references unknown renderer "missing"/);
		expect(() => normalizeRendererConfig({ registry: { three: './renderer.js' } })).toThrow(
			/package or project-root module ID/,
		);
		expect(() => normalizeRendererConfig({ registry: { dom: 'octane' } })).toThrow(
			/registry\.dom is built in/,
		);
		expect(() =>
			normalizeRendererConfig({
				registry: { three: '@octanejs/three/renderer' },
				rules: [{ include: '**/*.{tsrx}', renderer: 'three' }],
			}),
		).toThrow(/braces must contain two or more/);
		expect(() =>
			normalizeRendererConfig({
				registry: { three: '@octanejs/three/renderer' },
				boundaries: {
					'@octanejs/three': {
						Canvas: {
							ownerRenderer: 'dom',
							childRenderer: 'missing',
							prop: 'children',
						},
					},
				},
			}),
		).toThrow(/childRenderer references unknown renderer "missing"/);
		expect(() =>
			normalizeRendererConfig({
				registry: { three: '@octanejs/three/renderer' },
				boundaries: {
					'@octanejs/three': {
						Canvas: {
							ownerRenderer: 'three',
							childRenderer: 'three',
							prop: 'children',
						},
					},
				},
			}),
		).toThrow(/must switch renderers/);
		for (const prop of ['key', '__proto__']) {
			expect(() =>
				normalizeRendererConfig({
					registry: { three: '@octanejs/three/renderer' },
					boundaries: {
						'@octanejs/three': {
							Canvas: {
								ownerRenderer: 'dom',
								childRenderer: 'three',
								prop,
							},
						},
					},
				}),
			).toThrow(new RegExp(`\\.prop cannot be "${prop}".*cannot carry`));
		}
		expect(() =>
			normalizeRendererConfig({
				registry: {
					three: { module: '@octanejs/three/renderer', server: 'render' },
				},
			}),
		).toThrow(/cannot be "render"/);
		expect(() =>
			normalizeRendererConfig({
				registry: {
					three: { module: '@octanejs/three/renderer', text: 'coerce' },
				},
			}),
		).toThrow(/\.text must be "reject", "ignore", or "host"/);
		expect(() =>
			normalizeRendererConfig({
				registry: {
					three: { module: '@octanejs/three/renderer', intrinsics: './intrinsics' },
				},
			}),
		).toThrow(/\.intrinsics must be a package or project-root module ID/);
		expect(() =>
			normalizeRendererConfig({
				registry: {
					three: { module: '@octanejs/three/renderer', capabilities: ['Bad Capability'] },
				},
			}),
		).toThrow(/capabilities\[0\].*lowercase renderer ID/);
		expect(() =>
			normalizeRendererConfig({
				registry: { three: '@octanejs/three/renderer' },
				boundaries: {
					'@octanejs/three': {
						Canvas: {
							ownerRenderer: 'dom',
							childRenderer: 'three',
							prop: 'children',
							server: 'omit-child',
						},
					},
				},
			}),
		).toThrow(/childRenderer is explicitly "client-only"/);
	});
});
