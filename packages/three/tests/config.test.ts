import { describe, expect, it } from 'vitest';
import { normalizeRendererConfig } from 'octane/compiler/renderers';
import { threeRenderers } from '@octanejs/three/config';

describe('@octanejs/three renderer preset', () => {
	it('declares the client-only Three target and both DOM renderer boundaries', () => {
		const config = normalizeRendererConfig(threeRenderers);

		expect(config.registry.three).toEqual({
			module: '@octanejs/three/renderer',
			target: 'universal',
			server: 'client-only',
			intrinsics: '@octanejs/three/intrinsics',
			text: 'ignore',
			capabilities: ['local-host-callback', 'portal', 'visibility'],
		});
		expect(config.boundaries['@octanejs/three'].Canvas).toEqual({
			ownerRenderer: 'dom',
			childRenderer: 'three',
			prop: 'children',
			server: 'omit-child',
		});
		expect(config.boundaries['@octanejs/three'].DOMRegion).toEqual({
			ownerRenderer: 'three',
			childRenderer: 'dom',
			prop: 'children',
		});
		expect(config.rules).toEqual([
			{ include: ['**/*.three.tsrx'], exclude: [], renderer: 'three' },
		]);
	});
});
