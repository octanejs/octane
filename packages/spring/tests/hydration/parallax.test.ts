import { flushSync, hydrateRoot } from 'octane';
import { describe, expect, it, vi } from 'vitest';
import type { IParallax } from '../../src/parallax';
import { ParallaxFixture } from '../_fixtures/parallax.tsrx';

describe('React Spring Parallax hydration', () => {
	// Per packages/parallax/src/index.tsx:219
	it('adopts the server structure before client measurement', () => {
		const container = document.createElement('div');
		container.innerHTML = `<div id="parallax" style="position:absolute;top:0;left:0;width:100%;height:100%;overflow-y:scroll;overflow-x:hidden;-webkit-overflow-scrolling:touch;transform:translate3d(0px,0px,0px);"><div style="overflow:hidden;position:absolute;width:100%;height:0px;transform:translate3d(0px,0px,0px);"><!--[--><!--[--><!--[--><div id="normal-layer" style="position:absolute;top:0;bottom:0;left:0;right:0;background-size:auto;background-repeat:no-repeat;will-change:transform;transform:translate3d(0px,0px,0px);"><!--[-->normal<!--]--></div><!--]--><!--[--><div id="sticky-layer" style="position:absolute;top:0;bottom:0;left:0;right:0;background-size:auto;background-repeat:no-repeat;will-change:transform;transform:translate3d(0px,0px,0px);"><!--[-->sticky<!--]--></div><!--]--><!--]--><!--]--></div></div>`;
		const serverParallax = container.querySelector('#parallax');
		const serverNormal = container.querySelector('#normal-layer');
		const api = { current: null as IParallax | null };
		const error = vi.spyOn(console, 'error').mockImplementation(() => {});
		const root = hydrateRoot(container, ParallaxFixture, {
			api,
			horizontal: false,
			enabled: true,
		});
		flushSync(() => {});

		expect(container.querySelector('#parallax')).toBe(serverParallax);
		expect(container.querySelector('#normal-layer')).toBe(serverNormal);
		expect(api.current).not.toBeNull();
		expect(error).not.toHaveBeenCalled();

		root.unmount();
		error.mockRestore();
	});
});
