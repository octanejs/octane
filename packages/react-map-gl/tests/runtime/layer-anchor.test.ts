/**
 * Octane-only conformance for `react-map-gl-layer-missing-anchor`: a layer whose
 * `beforeId` names a layer the style does not hold yet. `differential:7` pins
 * the sibling stack against upstream; this covers the shapes it does not, a
 * style layer whose anchor arrives in a later render, and a custom layer, which
 * `updateLayer` never moves.
 */
import { describe, expect, it } from 'vitest';
import { act, mapboxgl, mount, settle } from '../_helpers';
import { LayerListMap } from '../_fixtures/map-apps.tsrx';

const baseProps = (layers: Record<string, unknown>[]) => ({
	mapLib: Promise.resolve(mapboxgl),
	mapboxAccessToken: 'test-token',
	mapStyle: { version: 8, sources: {}, layers: [] },
	layers,
});

const background = (id: string, beforeId?: string) => ({ id, type: 'background', beforeId });
const custom = (id: string, beforeId?: string) => ({ id, type: 'custom', render() {}, beforeId });

describe('layer anchored beneath a missing layer', () => {
	it('draws on top until its anchor arrives, then moves beneath it', async () => {
		const ref: { current: any } = { current: null };
		const view = mount(LayerListMap, { ...baseProps([background('lower', 'upper')]), ref } as any);
		try {
			await settle();
			const map = ref.current.getMap();
			expect(map.getStyle().layers.map((layer: any) => layer.id)).toEqual(['lower']);

			view.update(LayerListMap, {
				...baseProps([background('lower', 'upper'), background('upper')]),
				ref,
			} as any);
			await settle();
			expect(map.getStyle().layers.map((layer: any) => layer.id)).toEqual(['lower', 'upper']);
		} finally {
			act(() => view.unmount());
		}
	});

	it('adds a custom layer beneath its anchor once the anchor exists', async () => {
		const ref: { current: any } = { current: null };
		const view = mount(LayerListMap, { ...baseProps([custom('lower', 'upper')]), ref } as any);
		try {
			await settle();
			const map = ref.current.getMap();
			expect(map.getStyle().layers).toEqual([]);

			view.update(LayerListMap, {
				...baseProps([custom('lower', 'upper'), background('upper')]),
				ref,
			} as any);
			await settle();
			expect(map.getStyle().layers.map((layer: any) => layer.id)).toEqual(['lower', 'upper']);
		} finally {
			act(() => view.unmount());
		}
	});
});
