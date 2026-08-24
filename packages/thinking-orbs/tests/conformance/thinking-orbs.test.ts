import { cleanup, render } from '@octanejs/testing-library';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ThinkingOrb } from '../../src/index';
import { installCanvasMocks } from '../canvas-mock';

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
	document.body.replaceChildren();
});

describe('@octanejs/thinking-orbs component', () => {
	// @parity-case differential:thinking-orbs-canvas
	it('renders the accessible default canvas and a deterministic initial frame', () => {
		const mocks = installCanvasMocks();
		const { container } = render(ThinkingOrb, { props: { paused: true } });
		const canvas = container.querySelector('canvas');
		expect(canvas).toBeInstanceOf(HTMLCanvasElement);
		expect(canvas?.getAttribute('role')).toBe('img');
		expect(canvas?.getAttribute('aria-label')).toBe('Working…');
		expect(canvas?.style.width).toBe('64px');
		expect(canvas?.style.height).toBe('64px');
		expect(canvas?.width).toBe(64);
		expect(canvas?.height).toBe(64);
		expect(mocks.operationsFor(canvas!).some(({ name }) => name === 'arc')).toBe(true);
		mocks.requestAnimationFrame.mockClear();
		document.dispatchEvent(new Event('visibilitychange'));
		expect(mocks.requestAnimationFrame).not.toHaveBeenCalled();
	});

	it('forwards canvas attributes, custom labels, size, state, and style', () => {
		installCanvasMocks();
		const { container } = render(ThinkingOrb, {
			props: {
				state: 'searching',
				size: 20,
				theme: 'light',
				paused: true,
				'aria-label': 'Looking things up',
				'data-orb': 'search',
				style: { opacity: 0.5 },
			},
		});
		const canvas = container.querySelector('canvas')!;
		expect(canvas.getAttribute('aria-label')).toBe('Looking things up');
		expect(canvas.getAttribute('data-orb')).toBe('search');
		expect(canvas.style.cssText).toContain('width: 20px');
		expect(canvas.style.cssText).toContain('opacity: 0.5');
		expect(canvas.width).toBe(20);
		expect(canvas.height).toBe(20);
	});

	it('starts and stops animation with intersection visibility and cleans up on unmount', () => {
		const mocks = installCanvasMocks({ intersection: true });
		const view = render(ThinkingOrb, { props: { state: 'connecting' } });
		const canvas = view.container.querySelector('canvas')!;
		const [observer] = mocks.intersectionObservers;
		expect(observer.observe).toHaveBeenCalledWith(canvas);
		mocks.requestAnimationFrame.mockClear();
		expect(mocks.requestAnimationFrame).not.toHaveBeenCalled();

		observer.setVisible(canvas, true);
		expect(mocks.requestAnimationFrame).toHaveBeenCalledTimes(1);
		observer.setVisible(canvas, false);
		expect(mocks.cancelAnimationFrame).toHaveBeenCalled();

		view.unmount();
		expect(observer.disconnect).toHaveBeenCalledTimes(1);
	});

	// @parity-case differential:thinking-orbs-identity
	it('preserves the canvas node while changing animation state', () => {
		installCanvasMocks();
		const view = render(ThinkingOrb, { props: { state: 'working', paused: true } });
		const first = view.container.querySelector('canvas');
		view.rerender(ThinkingOrb, { props: { state: 'shaping', paused: true } });
		const second = view.container.querySelector('canvas');
		expect(second).toBe(first);
		expect(second?.getAttribute('aria-label')).toBe('Shaping…');
	});
});
