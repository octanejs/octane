/**
 * Octane-only conformance for how far an enclosing `<Source>` id travels.
 *
 * Upstream injects it with `cloneElement(child, {source: id})`, which reaches
 * direct children and nothing else. Octane cannot clone a compiled children
 * block, so the binding publishes the id through a context instead — and a
 * context has no notion of direct children, so it reaches any descendant.
 *
 * `ported:source-layer:3` pins the half both models share: a layer inherits the
 * generated id and an explicit `source` still loses to the enclosing one. It
 * mounts a direct child, so it cannot see the half where they part. That is what
 * this covers, and it is the behavior `react-map-gl-source-id-by-context`
 * promises a consumer — along with the escape hatch, since a layer that must not
 * belong to an enclosing source has to be moved out of it rather than given an
 * explicit source.
 */
import { describe, expect, it } from 'vitest';
import { act, mapboxgl, mount, settle } from '../_helpers';
import { NestedLayerMap } from '../_fixtures/upstream-apps.tsrx';

const geoJSON = { type: 'FeatureCollection', features: [] } as const;

const baseProps = (extra: Record<string, unknown>) => ({
	mapLib: Promise.resolve(mapboxgl),
	mapboxAccessToken: 'test-token',
	mapStyle: { version: 8, sources: {}, layers: [] },
	...extra,
});

describe('source id through context', () => {
	it('reaches a layer below a wrapper component, not only direct children', async () => {
		const ref: { current: any } = { current: null };
		const view = mount(
			NestedLayerMap,
			baseProps({
				ref,
				sourceProps: { type: 'geojson', data: geoJSON },
				layerProps: { id: 'nested', type: 'circle' },
			}) as any,
		);
		try {
			await settle();

			const sourceIds = [...ref.current.getMap()._sources.keys()];
			expect(sourceIds).toHaveLength(1);
			expect(sourceIds[0]).toMatch(/^jsx-source-\d+$/);
			// Upstream would have left this unset: cloneElement never sees it.
			expect(ref.current.getLayer('nested').source).toBe(sourceIds[0]);
		} finally {
			act(() => view.unmount());
		}
	});

	it('overrides an explicit source on a layer that deep', async () => {
		const ref: { current: any } = { current: null };
		const view = mount(
			NestedLayerMap,
			baseProps({
				ref,
				sourceProps: { type: 'geojson', data: geoJSON },
				layerProps: { id: 'nested', type: 'circle', source: 'ignored-source' },
			}) as any,
		);
		try {
			await settle();

			const sourceIds = [...ref.current.getMap()._sources.keys()];
			expect(ref.current.getLayer('nested').source).toBe(sourceIds[0]);
			expect(ref.current.getLayer('nested').source).not.toBe('ignored-source');
		} finally {
			act(() => view.unmount());
		}
	});
});
