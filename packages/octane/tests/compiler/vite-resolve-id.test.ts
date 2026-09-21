// @vitest-environment node

import { describe, expect, it, vi } from 'vitest';
import type { Plugin } from 'vite';
import { octane } from '../../src/compiler/vite.js';

function resolveIdHook(plugin: Plugin) {
	const hook = plugin.resolveId;
	if (typeof hook !== 'function') throw new Error('Missing resolveId hook.');
	return hook;
}

describe('Vite plugin resolveId', () => {
	it('preserves the full resolution for a rewritten server runtime request', async () => {
		const plugin = octane({ hmr: false }) as Plugin;
		const resolution = {
			id: 'octane/signals/server',
			external: true,
			moduleSideEffects: false,
			meta: {},
		};
		const resolve = vi.fn().mockResolvedValue(resolution);
		const result = await resolveIdHook(plugin).call(
			{ resolve } as never,
			'octane/signals/client',
			'/project/src/store.ts',
			{ ssr: true } as never,
		);
		expect(resolve).toHaveBeenCalledWith('octane/signals/server', '/project/src/store.ts', {
			skipSelf: true,
		});
		expect(result).toEqual(resolution);
	});

	it('leaves client requests and unresolvable requests alone', async () => {
		const plugin = octane({ hmr: false }) as Plugin;
		const resolve = vi.fn().mockResolvedValue(null);
		const hook = resolveIdHook(plugin);
		expect(
			await hook.call({ resolve } as never, 'octane/signals/client', '/project/src/store.ts', {
				ssr: false,
			} as never),
		).toBe(null);
		expect(resolve).not.toHaveBeenCalled();
		expect(
			await hook.call({ resolve } as never, 'octane/signals/client', '/project/src/store.ts', {
				ssr: true,
			} as never),
		).toBe(null);
	});
});
