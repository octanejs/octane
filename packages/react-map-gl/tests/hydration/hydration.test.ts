/**
 * The server can render everything around a map but nothing inside it, so the
 * hydration contract is narrow and easy to get wrong: the client's first render
 * must reproduce the server's markup exactly, adopt the container node the
 * server already emitted, and only then create the map inside that same node.
 *
 * Recreating the container instead of adopting it would still look correct in a
 * screenshot, while throwing away the server's layout box and any DOM a
 * consumer had already put there.
 */
import { describe, expect, it, vi } from 'vitest';
import { hydrateRoot } from 'octane';
import { renderHydrationFixture } from '../../../octane/tests/_hydration-ssr';
import { HydratePage } from './_fixtures/hydrate.tsrx';
import { mapboxgl, settle } from '../_helpers';

const FIXTURE = 'packages/react-map-gl/tests/hydration/_fixtures/hydrate.tsrx';

describe('@octanejs/react-map-gl hydration', () => {
	it('adopts the server-rendered container and mounts the map into it', async () => {
		// The server never receives a map library: `Map` loads one in an effect,
		// which does not run during `renderToString`.
		const server = await renderHydrationFixture('react-map-gl', FIXTURE, 'HydratePage', {});

		const container = document.createElement('div');
		container.innerHTML = server.html;
		document.body.appendChild(container);

		const serverPage = container.querySelector('#page')!;
		const serverHeading = container.querySelector('h1')!;
		const serverCounter = container.querySelector('#counter') as HTMLButtonElement;
		const serverMap = container.querySelector('#hydrated-map') as HTMLElement;

		// Nothing that needs the library may reach the server, or the client's
		// first render could not match it.
		expect(serverMap.children.length).toBe(0);
		expect(serverCounter.textContent).toBe('clicks: 0');

		const errors = vi.spyOn(console, 'error');
		const root = hydrateRoot(container, HydratePage, {
			mapLib: Promise.resolve(mapboxgl),
		});

		// Every server node survives hydration rather than being replaced.
		expect(container.querySelector('#page')).toBe(serverPage);
		expect(container.querySelector('h1')).toBe(serverHeading);
		expect(container.querySelector('#counter')).toBe(serverCounter);
		expect(container.querySelector('#hydrated-map')).toBe(serverMap);

		// The map arrives on a later turn, inside the adopted container.
		await settle();
		expect(container.querySelector('#hydrated-map')).toBe(serverMap);
		expect(serverMap.querySelector('canvas')).not.toBeNull();
		expect(serverMap.querySelector('[mapboxgl-children]')).not.toBeNull();

		// Overlays portal into library-owned elements, which live in that node too.
		expect(serverMap.querySelector('.mapboxgl-ctrl-group')).not.toBeNull();
		expect(serverMap.querySelector('.mapboxgl-marker')!.textContent).toBe('Pin');
		expect(serverMap.querySelector('.mapboxgl-popup')!.textContent).toBe('Here');

		// The server's own style survived; hydration did not reset the box the
		// page was laid out around.
		expect(serverMap.style.height).toBe('400px');
		expect(serverMap.style.position).toBe('relative');

		expect(errors).not.toHaveBeenCalled();
		errors.mockRestore();
		root.unmount();
		container.remove();
	});

	it('keeps the adopted page interactive once the map has loaded', async () => {
		const server = await renderHydrationFixture('react-map-gl', FIXTURE, 'HydratePage', {});

		const container = document.createElement('div');
		container.innerHTML = server.html;
		document.body.appendChild(container);

		const counter = container.querySelector('#counter') as HTMLButtonElement;
		const mapElement = container.querySelector('#hydrated-map') as HTMLElement;

		const root = hydrateRoot(container, HydratePage, {
			mapLib: Promise.resolve(mapboxgl),
		});
		await settle();

		const canvas = mapElement.querySelector('canvas');
		expect(canvas).not.toBeNull();

		counter.click();
		await settle();

		// The listener attached to the server's button, and re-rendering the page
		// around a live map neither replaced the button nor disturbed the map.
		expect(counter.textContent).toBe('clicks: 1');
		expect(container.querySelector('#counter')).toBe(counter);
		expect(container.querySelector('#hydrated-map')).toBe(mapElement);
		expect(mapElement.querySelector('canvas')).toBe(canvas);

		root.unmount();
		container.remove();
	});
});
