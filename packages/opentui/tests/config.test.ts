import { describe, expect, it } from 'vitest';
import { normalizeRendererConfig } from 'octane/compiler/renderers';
import { createOctaneSlotRegistry, createReactSlotRegistry } from '@octanejs/opentui';
import { opentuiRenderers } from '@octanejs/opentui/config';

describe('@octanejs/opentui renderer preset', () => {
	// @parity-case adapted:opentui-renderer-config
	it('selects the host-text universal renderer for .opentui.tsrx modules', () => {
		const config = normalizeRendererConfig(opentuiRenderers);

		expect(config.registry.opentui).toEqual({
			module: '@octanejs/opentui/renderer',
			target: 'universal',
			server: 'unsupported',
			intrinsics: '@octanejs/opentui/intrinsics',
			text: 'host',
			capabilities: ['portal', 'visibility'],
		});
		expect(config.rules).toEqual([
			{ include: ['**/*.opentui.tsrx'], exclude: [], renderer: 'opentui' },
		]);
	});

	// @parity-case adapted:opentui-slot-registry-alias
	it('retains the upstream slot-registry migration alias', () => {
		expect(createReactSlotRegistry).toBe(createOctaneSlotRegistry);
	});
});
