import { drainPassiveEffects, flushSync, hydrateRoot } from 'octane';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import { flushEffects } from '../../../octane/tests/_helpers.js';
import { renderHydrationFixture } from '../../../octane/tests/_hydration-ssr.js';
import { HydrationSkeleton } from './fixture.js';

function settle(): void {
	flushSync(() => {});
	drainPassiveEffects();
	flushEffects();
	flushSync(() => {});
}

let serverHtml = '';

beforeAll(async () => {
	serverHtml = (
		await renderHydrationFixture(
			'boneyard',
			'packages/boneyard/tests/hydration/fixture.tsx',
			'HydrationSkeleton',
		)
	).html;
});

describe('@octanejs/boneyard hydration', () => {
	// @parity-case differential:boneyard-hydration
	it('adopts static server skeleton markup without mismatch warnings', () => {
		const container = document.createElement('div');
		container.innerHTML = serverHtml;
		document.body.appendChild(container);
		const serverSkeleton = container.querySelector('[data-boneyard]')!;
		const error = vi.spyOn(console, 'error').mockImplementation(() => {});

		const root = hydrateRoot(container, HydrationSkeleton);
		settle();

		expect(container.querySelector('[data-boneyard]')).toBe(serverSkeleton);
		expect(container.querySelectorAll('[data-boneyard-bone]')).toHaveLength(1);
		expect(error).not.toHaveBeenCalled();

		root.unmount();
		error.mockRestore();
		container.remove();
	});
});
