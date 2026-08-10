import { createRequire } from 'node:module';
import type { EmblaCarouselType, EmblaOptionsType, EmblaPluginType } from 'embla-carousel';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import useEmblaCarouselReact from 'embla-carousel-react';
import { beforeEach, describe, expect, it } from 'vitest';
import { act as octaneAct } from 'octane';
import useEmblaCarousel from '@octanejs/embla-carousel';
import { mount } from '../_helpers';
import { CarouselHarness } from '../_fixtures/carousel.tsrx';
import { beginObservation, type Observation } from '../test-support/mock-embla';

const require = createRequire(import.meta.url);
const PINNED_REACT = '19.2.7';
const PINNED_REACT_DOM = '19.2.7';

function resolvedPackageVersion(name: string): string {
	return require(`${name}/package.json`).version as string;
}

type ReactHarnessProps = {
	options: EmblaOptionsType;
	plugins?: EmblaPluginType[];
	attached?: boolean;
	replacement?: boolean;
};

type RenderResult = {
	observation: Observation;
	apiDefined: boolean[];
};

type ApiProbe = { current: boolean };

function ReactCarousel({
	options,
	plugins = [],
	attached = true,
	replacement = false,
	apiProbe,
}: ReactHarnessProps & {
	apiProbe: ApiProbe;
}) {
	const [viewportRef, emblaApi] = useEmblaCarouselReact(options, plugins);
	apiProbe.current = emblaApi !== undefined;
	const slides = React.createElement(
		'div',
		null,
		React.createElement('div', null, 'One'),
		React.createElement('div', null, 'Two'),
	);
	const viewport = !attached
		? null
		: replacement
			? React.createElement('article', { ref: viewportRef, 'data-viewport': 'replacement' }, slides)
			: React.createElement('div', { ref: viewportRef, 'data-viewport': 'initial' }, slides);
	return React.createElement('section', { 'data-api': emblaApi ? 'ready' : 'pending' }, viewport);
}

async function renderReact(sequence: ReactHarnessProps[]): Promise<RenderResult> {
	const observation = beginObservation();
	const apiDefined: boolean[] = [];
	const apiProbe: ApiProbe = { current: false };
	const container = document.createElement('div');
	document.body.append(container);
	const root = createRoot(container);
	for (const props of sequence) {
		await act(function renderStep() {
			root.render(React.createElement(ReactCarousel, { ...props, apiProbe }));
		});
		apiDefined.push(apiProbe.current);
	}
	await act(function unmountStep() {
		root.unmount();
	});
	container.remove();
	return { observation, apiDefined };
}

function settleEffects(): void {
	// Sync Octane act drains render + effect cascades the way React's act settles
	// the matching root.render step — without an extra external root.render.
	void octaneAct(function settle() {});
}

function harnessProps(
	props: ReactHarnessProps,
	onApi: (api: EmblaCarouselType | undefined) => void,
) {
	return {
		options: props.options,
		plugins: props.plugins ?? [],
		onApi,
		attached: props.attached ?? true,
		replacement: props.replacement ?? false,
	};
}

function applyOctaneStep(
	result: ReturnType<typeof mount>,
	props: ReactHarnessProps,
	onApi: (api: EmblaCarouselType | undefined) => void,
	apiProbe: ApiProbe,
): boolean {
	result.update(CarouselHarness, harnessProps(props, onApi));
	settleEffects();
	return apiProbe.current;
}

function renderOctane(sequence: ReactHarnessProps[]): RenderResult {
	const observation = beginObservation();
	const apiDefined: boolean[] = [];
	const apiProbe: ApiProbe = { current: false };
	// Observe the published tuple member through onApi, not the fixture's
	// data-api attribute — otherwise a harness that derives readiness from
	// `attached` can stay green while the Octane API is never published.
	const onApi = function onApi(api: EmblaCarouselType | undefined) {
		apiProbe.current = api !== undefined;
	};
	const first = sequence[0];
	const result = mount(CarouselHarness, harnessProps(first, onApi));
	settleEffects();
	// One external render per sequence item, matching React's single root.render
	// per step. Construction publishes through setState inside an effect; settle
	// that update before observing — do not issue another same-props root render.
	apiDefined.push(apiProbe.current);
	for (const props of sequence.slice(1)) {
		apiDefined.push(applyOctaneStep(result, props, onApi, apiProbe));
	}
	result.unmount();
	settleEffects();
	return { observation, apiDefined };
}

function plugin(delay: number): EmblaPluginType {
	return {
		name: 'autoplay',
		options: { delay },
		init: function init() {},
		destroy: function destroy() {},
	} as EmblaPluginType;
}

beforeEach(function resetGlobals() {
	useEmblaCarousel.globalOptions = undefined;
	useEmblaCarouselReact.globalOptions = undefined;
});

describe('@octanejs/embla-carousel React differential', () => {
	// @parity-case embla:differential:oracle-versions
	it('rejects React oracle version drift', () => {
		expect(resolvedPackageVersion('react')).toBe(PINNED_REACT);
		expect(resolvedPackageVersion('react-dom')).toBe(PINNED_REACT_DOM);
		expect(React.version).toBe(PINNED_REACT);
	});

	// @parity-case embla:differential:lifecycle
	it('matches the pinned React adapter lifecycle across attachment, updates, and cleanup', async () => {
		const sequence = [
			{ options: { loop: false } },
			{ options: { loop: false } },
			{ options: { loop: true } },
		];
		const react = await renderReact(sequence);
		const octane = renderOctane(sequence);

		expect(octane.observation).toEqual(react.observation);
		expect(octane.apiDefined).toEqual(react.apiDefined);
		expect(
			octane.apiDefined.every(function isDefined(value) {
				return value;
			}),
		).toBe(true);
		expect(octane.observation).toEqual({
			constructs: 1,
			destroys: 1,
			reinitializations: [[{ loop: true }, []]],
			pluginsAtConstruct: [[]],
			globalOptionsAtConstruct: [undefined],
		});
	});

	// @parity-case embla:differential:plugins
	it('matches plugin bail-out and reinitialization against the pinned React adapter', async () => {
		const first = plugin(1000);
		const equivalent = plugin(1000);
		const changed = plugin(2000);
		const sequence = [
			{ options: {}, plugins: [first] },
			{ options: {}, plugins: [equivalent] },
			{ options: {}, plugins: [changed] },
		];
		const react = await renderReact(sequence);
		const octane = renderOctane(sequence);

		expect(octane.observation).toEqual(react.observation);
		expect(octane.apiDefined).toEqual(react.apiDefined);
		expect(octane.observation.constructs).toBe(1);
		expect(octane.observation.destroys).toBe(1);
		expect(octane.observation.reinitializations).toEqual([[{}, [changed]]]);
		expect(octane.observation.pluginsAtConstruct).toEqual([[first]]);
	});

	// @parity-case embla:differential:detach-replace
	it('matches detach and replacement viewport construction against the pinned React adapter', async () => {
		const sequence = [
			{ options: {}, attached: true, replacement: false },
			{ options: {}, attached: false, replacement: false },
			{ options: {}, attached: true, replacement: true },
		];
		const react = await renderReact(sequence);
		const octane = renderOctane(sequence);

		expect(octane.observation).toEqual(react.observation);
		expect(octane.apiDefined).toEqual(react.apiDefined);
		expect(octane.apiDefined).toEqual([true, false, true]);
		expect(octane.observation).toEqual({
			constructs: 2,
			destroys: 2,
			reinitializations: [],
			pluginsAtConstruct: [[], []],
			globalOptionsAtConstruct: [undefined, undefined],
		});
	});

	// @parity-case embla:differential:globals
	it('matches global option application against the pinned React adapter', async () => {
		useEmblaCarousel.globalOptions = { loop: true };
		useEmblaCarouselReact.globalOptions = { loop: true };
		const sequence = [{ options: {} }];
		const react = await renderReact(sequence);
		const octane = renderOctane(sequence);

		expect(octane.observation).toEqual(react.observation);
		expect(octane.apiDefined).toEqual(react.apiDefined);
		expect(octane.apiDefined).toEqual([true]);
		expect(octane.observation).toEqual({
			constructs: 1,
			destroys: 1,
			reinitializations: [],
			pluginsAtConstruct: [[]],
			globalOptionsAtConstruct: [{ loop: true }],
		});
	});
});
