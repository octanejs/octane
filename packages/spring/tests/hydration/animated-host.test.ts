import { raf } from '@react-spring/rafz';
import { flushSync, hydrateRoot } from 'octane';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SpringValue } from '../../src/index';
import { AnimatedSsrFixture } from '../_fixtures/animated-host.tsrx';

// Additional upstream provenance for shared adapted evidence:
// Per packages/animated/src/createHost.test.ts:11

afterEach(() => {
	raf.frameLoop = 'always';
});

describe('React Spring animated host hydration', () => {
	// Per targets/web/src/animated.test.tsx:50
	it('serializes initial values and adopts the existing host before client animation', () => {
		const container = document.createElement('div');
		container.innerHTML =
			'<!--[--><div id="animated-ssr" data-state="initial" style="left:12px;opacity:0.4;"><!--[-->hydrated spring<!--]--></div><!--]-->';
		const serverNode = container.querySelector('#animated-ssr');
		const error = vi.spyOn(console, 'error').mockImplementation(() => {});
		const left = new SpringValue(12);
		const opacity = new SpringValue(0.4);
		const root = hydrateRoot(container, AnimatedSsrFixture, { left, opacity });
		flushSync(() => {});

		expect(container.querySelector('#animated-ssr')).toBe(serverNode);
		expect(error).not.toHaveBeenCalled();
		raf.frameLoop = 'demand';
		left.set(30);
		opacity.set(0.8);
		raf.advance();
		expect((serverNode as HTMLElement).style.left).toBe('30px');
		expect((serverNode as HTMLElement).style.opacity).toBe('0.8');

		root.unmount();
		error.mockRestore();
	});
});
