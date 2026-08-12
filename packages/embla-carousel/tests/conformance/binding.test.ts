import type { EmblaCarouselType, EmblaPluginType } from 'embla-carousel';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import useEmblaCarousel from '@octanejs/embla-carousel';
import { flushEffects, mount } from '../_helpers';
import { CarouselHarness } from '../_fixtures/carousel.tsrx';

const embla = vi.hoisted(() => {
	const instances: Array<{
		api: Pick<EmblaCarouselType, 'destroy' | 'reInit'>;
		options: unknown;
		plugins: EmblaPluginType[];
		viewport: HTMLElement;
	}> = [];
	const factory = Object.assign(
		vi.fn((viewport: HTMLElement, options: unknown, plugins: EmblaPluginType[]) => {
			const api = { destroy: vi.fn(), reInit: vi.fn() };
			instances.push({ api, options, plugins, viewport });
			return api;
		}),
		{ globalOptions: undefined as unknown },
	);
	return { factory, instances };
});

vi.mock('embla-carousel', () => ({ default: embla.factory }));

function settleEffects(): void {
	flushEffects();
	flushEffects();
}

beforeEach(() => {
	embla.instances.length = 0;
	embla.factory.mockClear();
	embla.factory.globalOptions = undefined;
	useEmblaCarousel.globalOptions = undefined;
});

describe('@octanejs/embla-carousel lifecycle adapter', () => {
	// @parity-case embla:lifecycle:attach-cleanup
	it('publishes one API after viewport attachment and destroys it on unmount', () => {
		const observed: Array<EmblaCarouselType | undefined> = [];
		const props = {
			options: {},
			plugins: [],
			onApi: (api) => observed.push(api),
		};
		const result = mount(CarouselHarness, props);
		settleEffects();
		result.update(CarouselHarness, props);
		settleEffects();

		expect(embla.factory).toHaveBeenCalledOnce();
		expect(embla.instances[0]).toMatchObject({ options: {}, plugins: [] });
		expect(embla.instances[0].viewport).toBe(result.find('[data-viewport="initial"]'));
		expect(observed.at(-1)).toBe(embla.instances[0].api);

		result.unmount();
		settleEffects();
		expect(embla.instances[0].api.destroy).toHaveBeenCalledOnce();
	});

	// @parity-case embla:lifecycle:plugins
	it('bails out equivalent plugins and reinitializes changed plugin options', () => {
		const first = {
			name: 'autoplay',
			options: { delay: 1000 },
			init: () => {},
			destroy: () => {},
		} as EmblaPluginType;
		const equivalent = { ...first, options: { delay: 1000 } } as EmblaPluginType;
		const changed = { ...first, options: { delay: 2000 } } as EmblaPluginType;
		const onApi = () => {};
		const result = mount(CarouselHarness, { options: {}, plugins: [first], onApi });
		settleEffects();
		const api = embla.instances[0].api;

		result.update(CarouselHarness, { options: {}, plugins: [equivalent], onApi });
		settleEffects();
		expect(api.reInit).not.toHaveBeenCalled();

		result.update(CarouselHarness, { options: {}, plugins: [changed], onApi });
		settleEffects();
		expect(api.reInit).toHaveBeenCalledWith({}, [changed]);
		result.unmount();
	});

	// @parity-case embla:lifecycle:detach-replace
	it('resets the API on detach and constructs one fresh instance for a replacement viewport', () => {
		const observed: Array<EmblaCarouselType | undefined> = [];
		const onApi = (api: EmblaCarouselType | undefined) => observed.push(api);
		const result = mount(CarouselHarness, { options: {}, plugins: [], onApi });
		settleEffects();
		result.update(CarouselHarness, { options: {}, plugins: [], onApi });
		settleEffects();
		const initial = embla.instances[0];

		result.update(CarouselHarness, { options: {}, plugins: [], onApi, attached: false });
		settleEffects();
		result.update(CarouselHarness, { options: {}, plugins: [], onApi, attached: false });
		settleEffects();
		expect(initial.api.destroy).toHaveBeenCalledOnce();
		expect(observed.at(-1)).toBeUndefined();

		result.update(CarouselHarness, {
			options: {},
			plugins: [],
			onApi,
			attached: true,
			replacement: true,
		});
		settleEffects();
		expect(embla.instances).toHaveLength(2);
		expect(embla.instances[1].viewport).toBe(result.find('[data-viewport="replacement"]'));
		expect(embla.instances[1].api).not.toBe(initial.api);
		result.unmount();
		settleEffects();
		expect(embla.instances[1].api.destroy).toHaveBeenCalledOnce();
	});

	// @parity-case embla:lifecycle:options
	it('does not reinitialize equivalent options and reinitializes changed options', () => {
		const onApi = () => {};
		const result = mount(CarouselHarness, { options: { loop: false }, plugins: [], onApi });
		settleEffects();
		const api = embla.instances[0].api;

		result.update(CarouselHarness, { options: { loop: false }, plugins: [], onApi });
		settleEffects();
		expect(api.reInit).not.toHaveBeenCalled();

		result.update(CarouselHarness, { options: { loop: true }, plugins: [], onApi });
		settleEffects();
		expect(api.reInit).toHaveBeenCalledOnce();
		expect(api.reInit).toHaveBeenCalledWith({ loop: true }, []);
		result.unmount();
	});

	// @parity-case embla:lifecycle:globals
	it('applies global options before construction', () => {
		useEmblaCarousel.globalOptions = { loop: true };
		const result = mount(CarouselHarness, { options: {}, plugins: [], onApi: () => {} });
		settleEffects();

		expect(embla.factory.globalOptions).toEqual({ loop: true });
		result.unmount();
	});
});
