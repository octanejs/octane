import { describe, expect, it, vi } from 'vitest';
import { clone, createRoot, drainPassiveEffects, flushSync, template, useEffect } from 'octane';

describe('lazy client initialization', () => {
	it('parses a template on its first clone and reuses that parsed template', () => {
		const createElement = vi.spyOn(document, 'createElement');

		try {
			const token = template('<section data-lazy-template="ready"><span></span></section>');
			const templateCreations = () =>
				createElement.mock.calls.filter(([tagName]) => tagName === 'template');

			expect(templateCreations()).toHaveLength(0);

			const first = clone(token);
			const second = clone(token);

			expect(templateCreations()).toHaveLength(1);
			expect(first).not.toBe(second);
			expect(first.outerHTML).toBe('<section data-lazy-template="ready"><span></span></section>');
			expect(second.outerHTML).toBe(first.outerHTML);
		} finally {
			createElement.mockRestore();
		}
	});

	it('creates one post-paint channel only when passive work is scheduled', () => {
		let constructions = 0;
		const frames: FrameRequestCallback[] = [];
		class TestMessageChannel {
			port1: { onmessage: ((event?: unknown) => void) | null } = { onmessage: null };
			port2 = {
				postMessage: () => this.port1.onmessage?.(),
			};
			constructor() {
				constructions++;
			}
		}

		vi.stubGlobal('MessageChannel', TestMessageChannel);
		vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
			frames.push(callback);
			return frames.length;
		});

		const container = document.createElement('div');
		document.body.appendChild(container);
		const root = createRoot(container);
		const effectSlot = Symbol('lazy-client-initialization:passive');
		function WithoutPassiveEffect() {
			return null;
		}
		function WithPassiveEffect() {
			useEffect(() => {}, [], effectSlot);
			return null;
		}

		try {
			root.render(WithoutPassiveEffect);
			flushSync(() => {});
			expect(constructions).toBe(0);

			root.render(WithPassiveEffect);
			flushSync(() => {});
			expect(constructions).toBe(1);
			drainPassiveEffects();

			root.render(WithoutPassiveEffect);
			flushSync(() => {});
			root.render(WithPassiveEffect);
			flushSync(() => {});
			expect(constructions).toBe(1);
		} finally {
			root.unmount();
			drainPassiveEffects();
			for (const frame of frames) frame(performance.now());
			container.remove();
			vi.unstubAllGlobals();
		}
	});
});
