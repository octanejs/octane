/**
 * Ported from upstream/test/components/source.spec.jsx and
 * upstream/test/components/layer.spec.jsx.
 */
import { describe, expect, it } from 'vitest';
import { act, mapboxgl, mount, settle } from '../_helpers';
import { BareMap, SourceLayerMap, SourceMap } from '../_fixtures/upstream-apps.tsrx';

const geoJSON = { type: 'Point', coordinates: [0, 0] };
const geoJSON2 = { type: 'Point', coordinates: [1, 1] };
const mapStyle = { version: 8, sources: {}, layers: [] };
const pointLayer = {
	type: 'circle',
	paint: { 'circle-radius': 10, 'circle-color': '#007cbf' },
};
const pointLayer2 = {
	type: 'circle',
	paint: { 'circle-radius': 10, 'circle-color': '#000000' },
	layout: { visibility: 'none' },
};

function base(extra: Record<string, unknown> = {}) {
	return {
		mapLib: Promise.resolve(mapboxgl),
		mapboxAccessToken: 'test-token',
		...extra,
	};
}

describe('Source', () => {
	// Per upstream/test/components/source.spec.jsx:8 ('Source/Layer')
	// @parity-case ported:source-layer:1
	it('adds, updates and removes a source across style changes', async () => {
		const ref: { current: any } = { current: null };
		const view = mount(
			SourceMap,
			base({ ref, sourceProps: { id: 'my-data', type: 'geojson', data: geoJSON } }) as any,
		);
		try {
			await settle();
			expect(ref.current.getSource('my-data')).toBeTruthy();

			view.update(
				SourceMap,
				base({
					ref,
					mapStyle,
					sourceProps: { id: 'my-data', type: 'geojson', data: geoJSON },
				}) as any,
			);
			await settle();
			expect(ref.current.getSource('my-data')).toBeTruthy();

			view.update(
				SourceMap,
				base({
					ref,
					mapStyle,
					sourceProps: { id: 'my-data', type: 'geojson', data: geoJSON2 },
				}) as any,
			);
			await settle();
			expect(ref.current.getSource('my-data')._data).toEqual(geoJSON2);

			view.update(BareMap, base({ ref, mapStyle }) as any);
			await settle();
			expect(ref.current.getSource('my-data')).toBeFalsy();
		} finally {
			act(() => view.unmount());
		}
	});
});

describe('Layer', () => {
	// Per upstream/test/components/layer.spec.jsx:9 ('Source/Layer')
	// @parity-case ported:source-layer:2
	it('adds, updates and removes a layer alongside its source', async () => {
		const ref: { current: any } = { current: null };
		const view = mount(
			SourceLayerMap,
			base({
				ref,
				sourceProps: { id: 'my-data', type: 'geojson', data: geoJSON },
				layerProps: { id: 'my-layer', ...pointLayer },
			}) as any,
		);
		try {
			await settle();
			expect(ref.current.getLayer('my-layer')).toBeTruthy();

			view.update(
				SourceLayerMap,
				base({
					ref,
					sourceProps: { id: 'my-data', type: 'geojson', data: geoJSON },
					layerProps: { id: 'my-layer', ...pointLayer2 },
				}) as any,
			);
			await settle();
			expect(ref.current.getLayer('my-layer').layout.visibility).toBe('none');

			view.update(
				SourceLayerMap,
				base({
					ref,
					mapStyle,
					sourceProps: { id: 'my-data', type: 'geojson', data: geoJSON },
					layerProps: { id: 'my-layer', ...pointLayer2 },
				}) as any,
			);
			await settle();
			expect(ref.current.getLayer('my-layer')).toBeTruthy();

			view.update(BareMap, base({ ref, mapStyle }) as any);
			await settle();
			expect(ref.current.getSource('my-data')).toBeFalsy();
			expect(ref.current.getLayer('my-layer')).toBeFalsy();
		} finally {
			act(() => view.unmount());
		}
	});

	/**
	 * OCTANE DIVERGENCE[react-map-gl-source-id-by-context][ported:source-layer:3]: upstream injects the enclosing source's id by cloning
	 * each child — `cloneElement(child, {source: id})` — which also overrides an
	 * explicitly set `source`. Octane cannot clone a children block, so the id
	 * travels by context. This pins the same observable outcome: a layer with no
	 * source of its own inherits the generated id, and an explicit one still
	 * loses to the enclosing source exactly as cloneElement made it lose.
	 */
	// @parity-case ported:source-layer:3
	it('gives a nested layer the enclosing source id, overriding an explicit source', async () => {
		const ref: { current: any } = { current: null };
		const view = mount(
			SourceLayerMap,
			base({
				ref,
				sourceProps: { type: 'geojson', data: geoJSON },
				layerProps: { id: 'inherits', type: 'circle', source: 'ignored-source' },
			}) as any,
		);
		try {
			await settle();

			const sourceIds = [...ref.current.getMap()._sources.keys()];
			expect(sourceIds).toHaveLength(1);
			expect(sourceIds[0]).toMatch(/^jsx-source-\d+$/);
			expect(ref.current.getLayer('inherits').source).toBe(sourceIds[0]);
		} finally {
			act(() => view.unmount());
		}
	});
});
