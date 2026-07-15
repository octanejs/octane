import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { drainPassiveEffects, flushSync, hydrateRoot } from 'octane';
import { HydrationFixture } from '../_fixtures/hydration.tsrx';
import { SERVER_HTML } from './server-html';

function expandCountedMarkers(html: string): string {
	return html.replace(/<!--([\[\]])([1-9]\d*)-->/g, (whole, marker: string, raw: string) => {
		const count = Number(raw);
		return Number.isSafeInteger(count) && count > 1 ? `<!--${marker}-->`.repeat(count) : whole;
	});
}

function settle(): void {
	flushSync(() => {});
	drainPassiveEffects();
	flushSync(() => {});
}

let container: HTMLDivElement;
let error: ReturnType<typeof vi.spyOn>;
let warn: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
	container = document.createElement('div');
	container.innerHTML = SERVER_HTML;
	document.body.appendChild(container);
	error = vi.spyOn(console, 'error');
	warn = vi.spyOn(console, 'warn');
});

afterEach(() => {
	expect(error.mock.calls).toEqual([]);
	expect(warn.mock.calls).toEqual([]);
	error.mockRestore();
	warn.mockRestore();
	container.remove();
});

describe('@octanejs/visx hydration', () => {
	it('adopts fixed SVG, generated definitions, axes, text, and XYChart nodes in place', () => {
		const main = container.querySelector('#visx-hydration-fixture');
		const svg = container.querySelector('#visx-hydration-svg');
		const gradient = container.querySelector('linearGradient');
		const axis = container.querySelector('.visx-axis-bottom');
		const text = container.querySelector('text');
		const seriesBar = container.querySelector('.vx-bar-series .visx-bar');
		const annotation = container.querySelector('.hydration-annotation');
		const word = container.querySelector('.hydration-word');
		const before = container.innerHTML;

		const root = hydrateRoot(container, HydrationFixture, {});
		expect(expandCountedMarkers(container.innerHTML)).toBe(before);
		expect(container.querySelector('#visx-hydration-fixture')).toBe(main);
		expect(container.querySelector('#visx-hydration-svg')).toBe(svg);
		expect(container.querySelector('linearGradient')).toBe(gradient);
		expect(container.querySelector('.visx-axis-bottom')).toBe(axis);
		expect(container.querySelector('text')).toBe(text);
		expect(container.querySelector('.vx-bar-series .visx-bar')).toBe(seriesBar);
		expect(container.querySelector('.hydration-annotation')).toBe(annotation);
		expect(container.querySelector('.hydration-word')).toBe(word);

		settle();
		expect(expandCountedMarkers(container.innerHTML)).toBe(before);
		expect(container.querySelector('#visx-hydration-svg')).toBe(svg);
		expect(container.querySelector('.hydration-annotation')).toBe(annotation);
		expect(container.querySelector('.hydration-word')).toBe(word);

		flushSync(() => {
			(container.querySelector('#visx-hydration-button') as HTMLButtonElement).click();
		});
		expect(container.querySelector('#visx-hydration-output')?.textContent).toBe('clicked');
		expect(container.querySelector('#visx-hydration-svg')).toBe(svg);
		expect(container.querySelector('.vx-bar-series .visx-bar')).toBe(seriesBar);
		root.unmount();
	});
});
