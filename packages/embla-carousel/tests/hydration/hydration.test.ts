import type { EmblaCarouselType } from 'embla-carousel';
import { drainPassiveEffects, flushSync, hydrateRoot } from 'octane';
import { describe, expect, it, vi } from 'vitest';
import { CarouselHarness } from '../_fixtures/carousel.tsrx';
import { SERVER_HTML } from './server-html';

const embla = vi.hoisted(() => {
	const instances: Array<Pick<EmblaCarouselType, 'destroy' | 'reInit'>> = [];
	const factory = Object.assign(
		vi.fn(() => {
			const api = { destroy: vi.fn(), reInit: vi.fn() };
			instances.push(api);
			return api;
		}),
		{ globalOptions: undefined as unknown },
	);
	return { factory, instances };
});

vi.mock('embla-carousel', () => ({ default: embla.factory }));

function settle(): void {
	flushSync(() => {});
	drainPassiveEffects();
	flushSync(() => {});
	drainPassiveEffects();
}

describe('@octanejs/embla-carousel hydration', () => {
	// @parity-case embla:hydration:single-construction
	it('constructs once after adoption and destroys the hydrated instance on cleanup', () => {
		const props = { options: { loop: true }, plugins: [], onApi: () => {} };
		expect(embla.factory).not.toHaveBeenCalled();

		const container = document.createElement('div');
		container.innerHTML = SERVER_HTML;
		document.body.append(container);
		const viewport = container.querySelector('[data-viewport="initial"]');
		const root = hydrateRoot(container, CarouselHarness, props);
		settle();

		expect(embla.factory).toHaveBeenCalledOnce();
		expect(container.querySelector('[data-viewport="initial"]')).toBe(viewport);
		root.unmount();
		settle();
		expect(embla.instances[0].destroy).toHaveBeenCalledOnce();
		container.remove();
	});
});
