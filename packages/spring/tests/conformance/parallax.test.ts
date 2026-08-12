import { raf } from '@react-spring/rafz';
import { describe, expect, it, vi } from 'vitest';
import { flushEffects, mount } from '../../../octane/tests/_helpers';
import type { IParallax } from '../../src/parallax.tsrx';
import { ParallaxFixture } from '../_fixtures/parallax.tsrx';

describe('Parallax', () => {
	// Per packages/parallax/src/index.tsx:219
	it('positions normal and sticky layers and exposes imperative scrolling', async () => {
		const disconnect = vi.fn();
		vi.stubGlobal(
			'ResizeObserver',
			class {
				observe() {}
				disconnect() {
					disconnect();
				}
			},
		);
		const api = { current: null as IParallax | null };
		const result = mount(ParallaxFixture, { api, horizontal: false, enabled: true });
		flushEffects();
		const container = result.find('#parallax') as HTMLElement;
		Object.defineProperty(container, 'clientHeight', { value: 200 });
		api.current!.update();

		expect((result.find('#normal-layer') as HTMLElement).style.transform).toBe(
			'translate3d(0,300px,0)',
		);
		raf.frameLoop = 'demand';
		api.current!.scrollTo(1);
		const now = raf.now;
		let time = now();
		raf.now = () => (time += 16.667);
		for (let frame = 0; frame < 180; frame++) raf.advance();
		raf.now = now;
		await Promise.resolve();
		expect(container.scrollTop).toBe(200);
		expect((result.find('#normal-layer') as HTMLElement).style.transform).toBe(
			'translate3d(0,200px,0)',
		);
		expect((result.find('#sticky-layer') as HTMLElement).style.transform).toBe(
			'translate3d(0,0px,0)',
		);

		result.unmount();
		expect(disconnect).toHaveBeenCalled();
		raf.frameLoop = 'always';
	});
});
