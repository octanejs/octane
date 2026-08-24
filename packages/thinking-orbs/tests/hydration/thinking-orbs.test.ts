import { drainPassiveEffects, flushSync, hydrateRoot } from 'octane';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import { flushEffects } from '../../../octane/tests/_helpers';
import { renderHydrationFixture } from '../../../octane/tests/_hydration-ssr';
import { installCanvasMocks } from '../canvas-mock';
import { HydrationOrb } from './fixture.tsrx';

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
			'thinking-orbs',
			'packages/thinking-orbs/tests/hydration/fixture.tsrx',
			'HydrationOrb',
		)
	).html;
});

describe('@octanejs/thinking-orbs hydration', () => {
	// @parity-case differential:thinking-orbs-hydration
	it('adopts the server canvas and starts drawing after commit', () => {
		const mocks = installCanvasMocks();
		const container = document.createElement('div');
		container.innerHTML = serverHtml;
		document.body.appendChild(container);
		const serverCanvas = container.querySelector('canvas')!;
		const error = vi.spyOn(console, 'error').mockImplementation(() => {});

		const root = hydrateRoot(container, HydrationOrb);
		settle();

		const hydratedCanvas = container.querySelector('canvas')!;
		expect(hydratedCanvas).toBe(serverCanvas);
		expect(hydratedCanvas.width).toBe(20);
		expect(hydratedCanvas.height).toBe(20);
		expect(mocks.operationsFor(hydratedCanvas).some(({ name }) => name === 'arc')).toBe(true);
		expect(error).not.toHaveBeenCalled();

		root.unmount();
		error.mockRestore();
		container.remove();
		vi.unstubAllGlobals();
	});
});
