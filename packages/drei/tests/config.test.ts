import { normalizeRendererConfig } from 'octane/compiler/renderers';
import { describe, expect, it } from 'vitest';
import { dreiRenderers } from '../src/config.js';

describe('@octanejs/drei renderer preset', () => {
	it('composes Three and declares the Html DOM child boundary', () => {
		const config = normalizeRendererConfig(dreiRenderers);
		expect(config.registry.three?.module).toBe('@octanejs/three/renderer');
		expect(config.boundaries['@octanejs/three'].DOMRegion.childRenderer).toBe('dom');
		expect(config.boundaries['@octanejs/drei'].Html).toEqual({
			ownerRenderer: 'three',
			childRenderer: 'dom',
			prop: 'children',
		});
	});
});
