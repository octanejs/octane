/**
 * The same fixture runs through @octanejs/react-map-gl and the published
 * @vis.gl/react-mapbox 8.1.2 on real React, against the same mapbox-gl double.
 *
 * This is what licenses the double as evidence elsewhere in the suite: a double
 * that flattered the Octane binding would have to flatter React identically for
 * these comparisons to hold.
 */
import { describe, expect, it } from 'vitest';
import { resolve } from 'node:path';
import { act } from 'react';
import { mountDifferential, type DiffMount } from '../../../octane/tests/differential/_rig.js';
import mapboxgl from '../_mocks/mapbox-gl';

const FIXTURE = resolve(__dirname, '../_fixtures/differential/map-diff.tsrx');
const SOURCE_LAYER_FIXTURE = resolve(__dirname, '../_fixtures/differential/source-layer-diff.tsrx');
const OVERLAY_FIXTURE = resolve(__dirname, '../_fixtures/differential/overlay-diff.tsrx');
const USE_MAP_FIXTURE = resolve(__dirname, '../_fixtures/differential/use-map-diff.tsrx');
const USE_CONTROL_FIXTURE = resolve(__dirname, '../_fixtures/differential/use-control-diff.tsrx');
const MARKER_CHILDREN_FIXTURE = resolve(
	__dirname,
	'../_fixtures/differential/marker-children-diff.tsrx',
);
const CACHE = resolve(__dirname, '.react-cache');

async function settle(): Promise<void> {
	await act(async () => {
		await new Promise((resolvePromise) => setTimeout(resolvePromise, 20));
	});
}

/**
 * Element markup with comment nodes removed. Octane anchors portals and
 * conditional blocks with comments; those are an implementation detail of where
 * content can be re-inserted, not content a consumer renders.
 */
function contentOf(element: Element): string {
	const clone = element.cloneNode(true) as Element;
	const walker = clone.ownerDocument.createTreeWalker(clone, NodeFilter.SHOW_COMMENT);
	const comments: Node[] = [];
	while (walker.nextNode()) comments.push(walker.currentNode);
	for (const comment of comments) comment.parentNode?.removeChild(comment);
	return clone.innerHTML;
}

/** The map container's children, by tag and identifying attribute. */
function containerChildren(mount: DiffMount): string[] {
	const container = mount.container.querySelector('div[style*="position: relative"]');
	return [...(container?.children ?? [])].map((child) => {
		if (child.hasAttribute('mapboxgl-children')) return 'children-container';
		if (child.tagName === 'CANVAS') return 'canvas';
		return `${child.tagName.toLowerCase()}.${child.className}`;
	});
}

describe('differential: @octanejs/react-map-gl vs @vis.gl/react-mapbox 8.1.2', () => {
	// @parity-case differential:1
	it('renders the same map DOM, and updates marker content identically', async () => {
		const differential = await mountDifferential(
			FIXTURE,
			'MapDiff',
			{ mapLib: Promise.resolve(mapboxgl) },
			CACHE,
		);

		/**
		 * Sibling order inside the map container is load-bearing, not cosmetic.
		 * The children container must come after the DOM mapbox-gl builds: ahead
		 * of it, a full-height block displaces `.mapboxgl-canvas-container` — the
		 * element mapbox-gl measures every pointer coordinate against — and a
		 * consumer's positioned overlay paints beneath the opaque canvas instead
		 * of above it. The binding therefore appends that container next to the
		 * library's nodes rather than rendering it into the template.
		 */
		await differential.observe('map shell after the library resolves', async (octane, react) => {
			// The map library resolves through a promise, then its style loads on a
			// later turn, and each stage appends more DOM.
			await settle();
			await settle();

			const expected = [
				'canvas',
				'children-container',
				'div.mapboxgl-ctrl mapboxgl-ctrl-attrib',
				'div.mapboxgl-ctrl mapboxgl-ctrl-group',
				'div.mapboxgl-marker',
				'div.mapboxgl-popup',
			];
			expect(containerChildren(octane)).toEqual(expected);
			expect(containerChildren(react)).toEqual(expected);
		});

		// Everything portalled into library-owned elements must match exactly.
		await differential.observe('portalled marker and popup content', (octane, react) => {
			for (const mount of [octane, react]) {
				expect(contentOf(mount.find('.mapboxgl-marker')!)).toBe('<span class="pin">A</span>');
				expect(contentOf(mount.find('.mapboxgl-popup')!)).toBe(
					'<div><div class="popup-body">Here</div></div>',
				);
			}
		});

		await differential.observe('marker content updates in place', async (octane, react) => {
			const octaneElement = octane.find('.mapboxgl-marker')!;
			const reactElement = react.find('.mapboxgl-marker')!;

			await octane.click('#relabel');
			await react.click('#relabel');
			await settle();

			// Same new content, and the marker element itself survived on both
			// sides — recreating the marker for a child change would make every pin
			// flicker and drop its Mapbox drag state.
			expect(octane.find('.mapboxgl-marker')).toBe(octaneElement);
			expect(react.find('.mapboxgl-marker')).toBe(reactElement);
			expect(contentOf(octaneElement)).toBe('<span class="pin">B</span>');
			expect(contentOf(reactElement)).toBe('<span class="pin">B</span>');
		});

		differential.unmount();
	});

	// @parity-case differential:2
	it('drives the same source and layer calls into the map', async () => {
		const differential = await mountDifferential(
			SOURCE_LAYER_FIXTURE,
			'SourceLayerDiff',
			{ mapLib: Promise.resolve(mapboxgl) },
			CACHE,
		);

		/** The style the probe read back, as JSON text from the page. */
		async function snapshot(mount: DiffMount): Promise<string> {
			await mount.click('#snap');
			await settle();
			return mount.find('#snapshot')!.textContent ?? '';
		}

		await differential.observe('style after the source and layer are added', async (o, r) => {
			await settle();
			await settle();

			const octaneStyle = await snapshot(o);
			expect(octaneStyle).toBe(await snapshot(r));

			// Not merely equal to each other: the layer must have reached the map
			// and inherited the enclosing source's id on both sides.
			expect(JSON.parse(octaneStyle)).toEqual({
				sources: [
					{
						id: 'data',
						type: 'geojson',
						data: expect.objectContaining({ type: 'FeatureCollection' }),
					},
				],
				layers: [{ id: 'dots', source: 'data', paint: { 'circle-radius': 10 } }],
			});
		});

		await differential.observe('paint and data updates reach the map', async (o, r) => {
			for (const mount of [o, r]) {
				await mount.click('#grow');
				await mount.click('#add-point');
			}
			await settle();

			const octaneStyle = await snapshot(o);
			expect(octaneStyle).toBe(await snapshot(r));

			const style = JSON.parse(octaneStyle);
			expect(style.layers[0].paint).toEqual({ 'circle-radius': 20 });
			expect(style.sources[0].data.features).toHaveLength(2);
			// The update went through setData/setPaintProperty rather than a
			// teardown and re-add, which would have dropped the rendered tiles.
			expect(style.sources).toHaveLength(1);
			expect(style.layers).toHaveLength(1);
		});

		await differential.observe('removing the layer leaves its source in place', async (o, r) => {
			for (const mount of [o, r]) await mount.click('#drop-layer');
			await settle();

			const octaneStyle = await snapshot(o);
			expect(octaneStyle).toBe(await snapshot(r));

			const style = JSON.parse(octaneStyle);
			expect(style.layers).toEqual([]);
			expect(style.sources.map((source: any) => source.id)).toEqual(['data']);
		});

		differential.unmount();
	});

	// @parity-case differential:3
	it('updates popup options in place and adds and removes controls alike', async () => {
		const differential = await mountDifferential(
			OVERLAY_FIXTURE,
			'OverlayDiff',
			{ mapLib: Promise.resolve(mapboxgl) },
			CACHE,
		);

		/** Control elements the map is holding, by their library-assigned class. */
		function controls(mount: DiffMount): string[] {
			return [...mount.container.querySelectorAll('.mapboxgl-ctrl')]
				.map((element) => element.className)
				.sort();
		}

		async function popupOptions(mount: DiffMount): Promise<string> {
			await mount.click('#read-options');
			await settle();
			return mount.find('#popup-options')!.textContent ?? '';
		}

		let octanePopup: Element;
		let reactPopup: Element;

		await differential.observe('initial overlays', async (o, r) => {
			await settle();
			await settle();

			octanePopup = o.find('.mapboxgl-popup')!;
			reactPopup = r.find('.mapboxgl-popup')!;

			expect(controls(o)).toEqual(controls(r));
			expect(controls(o)).toEqual(['mapboxgl-ctrl mapboxgl-ctrl-group']);
			expect(octanePopup.className).toBe(reactPopup.className);
			expect(octanePopup.className).toBe('mapboxgl-popup note');
			expect(await popupOptions(o)).toBe(await popupOptions(r));
			expect(JSON.parse(await popupOptions(o))).toEqual({ maxWidth: '160px', offset: 12 });
		});

		await differential.observe('changed popup options land on the same popup', async (o, r) => {
			for (const mount of [o, r]) await mount.click('#widen');
			await settle();

			// Same instance on both sides — rebuilding the popup for an option
			// change would close and reopen it in front of the user.
			expect(o.find('.mapboxgl-popup')).toBe(octanePopup);
			expect(r.find('.mapboxgl-popup')).toBe(reactPopup);

			expect(octanePopup.className).toBe(reactPopup.className);
			expect(octanePopup.classList.contains('wide')).toBe(true);
			expect(await popupOptions(o)).toBe(await popupOptions(r));
			expect(JSON.parse(await popupOptions(o))).toEqual({ maxWidth: '320px', offset: 24 });
		});

		await differential.observe('controls come and go together', async (o, r) => {
			for (const mount of [o, r]) {
				await mount.click('#add-scale');
				await mount.click('#drop-nav');
			}
			await settle();

			expect(controls(o)).toEqual(controls(r));
			expect(controls(o)).toEqual(['mapboxgl-ctrl mapboxgl-ctrl-scale']);
			// The popup is not a control and must have survived both changes.
			expect(o.find('.mapboxgl-popup')).toBe(octanePopup);
			expect(r.find('.mapboxgl-popup')).toBe(reactPopup);
		});

		differential.unmount();
	});

	// @parity-case differential:4
	it('reaches the map by id from outside it, and flies it', async () => {
		const differential = await mountDifferential(
			USE_MAP_FIXTURE,
			'UseMapDiff',
			{ mapLib: Promise.resolve(mapboxgl) },
			CACHE,
		);

		async function probe(mount: DiffMount): Promise<any> {
			await mount.click('#probe');
			await settle();
			return JSON.parse(mount.find('#toolbar')!.textContent ?? '{}');
		}

		await differential.observe('a toolbar outside the map', async (o, r) => {
			await settle();
			await settle();

			const octaneProbe = await probe(o);
			expect(octaneProbe).toEqual(await probe(r));

			// `current` is empty out here on both bindings — this is the trap. The
			// map is reachable only through the id it registered under.
			expect(octaneProbe).toEqual({
				currentIsEmptyOutsideMap: true,
				reachableById: true,
				center: [-100, 40],
				zoom: 4,
			});
		});

		await differential.observe('flyTo through the id-addressed map', async (o, r) => {
			for (const mount of [o, r]) await mount.click('#fly');
			await settle();

			const octaneProbe = await probe(o);
			expect(octaneProbe).toEqual(await probe(r));

			// The camera actually moved — a no-op flyTo would leave it at -100/40/4,
			// which is exactly how a silently-unreachable map presents itself.
			expect(octaneProbe.center).toEqual([-9.139, 38.722]);
			expect(octaneProbe.zoom).toBe(12);
		});

		differential.unmount();
	});

	// @parity-case differential:5
	it('honours useControl options called straight from a consumer module', async () => {
		const removals: string[] = [];
		const differential = await mountDifferential(
			USE_CONTROL_FIXTURE,
			'UseControlDiff',
			{ mapLib: Promise.resolve(mapboxgl), onRemoved: () => removals.push('removed') },
			CACHE,
		);

		const position = (mount: DiffMount, selector: string) =>
			(mount.find(selector) as HTMLElement | null)?.dataset.position;

		await differential.observe('consumer-placed controls', async (o, r) => {
			await settle();
			await settle();

			// Octane appends a call-site slot to custom hook calls and retains it as
			// the last argument, so a hook resolving optional trailing parameters has
			// to strip it. Getting that wrong drops the caller's options silently and
			// the control lands in the default corner instead.
			expect(position(o, '.mapboxgl-ctrl-scale')).toBe(position(r, '.mapboxgl-ctrl-scale'));
			expect(position(o, '.mapboxgl-ctrl-scale')).toBe('bottom-left');

			// The three-argument form resolves through a different position, and the
			// onRemove callback must not be mistaken for the options object either.
			expect(position(o, '.mapboxgl-ctrl-group')).toBe(position(r, '.mapboxgl-ctrl-group'));
			expect(position(o, '.mapboxgl-ctrl-group')).toBe('top-left');
		});

		differential.unmount();
		await settle();

		// Both sides ran the consumer's onRemove on teardown — proof the callback
		// still landed in the right positional slot after stripping.
		expect(removals).toEqual(['removed', 'removed']);
	});

	// @parity-case differential:6
	it('picks the default pin or a custom element the same way as upstream', async () => {
		const differential = await mountDifferential(
			MARKER_CHILDREN_FIXTURE,
			'MarkerChildrenDiff',
			{ mapLib: Promise.resolve(mapboxgl), showPin: false, showText: true },
			CACHE,
		);

		await differential.observe('marker elements', async (o, r) => {
			await settle();
			await settle();
			// A marker whose block renders nothing is rebuilt with the default pin,
			// which costs one extra render cycle beyond the map coming up.
			await settle();

			/** Whether each marker ended up with Mapbox's own pin. */
			const pins = (mount: DiffMount) =>
				['empty-block', 'filled-block', 'no-children'].map((name) => {
					const element = mount.find(`.mapboxgl-marker.${name}`) as HTMLElement | null;
					return [name, element?.dataset.pin === 'default'] as const;
				});

			expect(pins(o)).toEqual(pins(r));
			expect(Object.fromEntries(pins(o))).toEqual({
				// A block that renders nothing is not children — Mapbox draws its pin.
				'empty-block': true,
				// A block that renders something is, so the binding owns the element.
				'filled-block': false,
				'no-children': true,
			});

			// And the custom one actually carries the content.
			expect(o.find('.mapboxgl-marker.filled-block')!.textContent).toContain('just text');
			expect(r.find('.mapboxgl-marker.filled-block')!.textContent).toContain('just text');
		});

		differential.unmount();
	});
});
