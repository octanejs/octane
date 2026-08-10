/** Ported from upstream/test/components/controls.spec.jsx. */
import { describe, expect, it } from 'vitest';
import { act, mapboxgl, mount, settle } from '../_helpers';
import {
	AttributionControlMap,
	FullscreenControlMap,
	GeolocateControlMap,
	NavigationControlMap,
	ScaleControlMap,
} from '../_fixtures/upstream-apps.tsrx';

function base(extra: Record<string, unknown> = {}) {
	return {
		mapLib: Promise.resolve(mapboxgl),
		mapboxAccessToken: 'test-token',
		...extra,
	};
}

describe('Controls', () => {
	// Per upstream/test/components/controls.spec.jsx:15 ('Controls')
	// @parity-case ported:controls:1
	it('renders <AttributionControl />', async () => {
		const view = mount(AttributionControlMap, base() as any);
		try {
			await settle();
			expect(view.container.querySelector('.mapboxgl-ctrl-attrib')).not.toBeNull();
		} finally {
			act(() => view.unmount());
		}
	});

	// @parity-case ported:controls:2
	it('renders <FullscreenControl />', async () => {
		const view = mount(FullscreenControlMap, base() as any);
		try {
			await settle();
			expect(view.container.querySelector('.mapboxgl-ctrl-fullscreen')).not.toBeNull();
		} finally {
			act(() => view.unmount());
		}
	});

	// @parity-case ported:controls:3
	it('renders <GeolocateControl /> and exposes it through the ref prop', async () => {
		const controlRef: { current: any } = { current: null };
		const view = mount(GeolocateControlMap, base({ controlRef }) as any);
		try {
			await settle();
			expect(view.container.querySelector('.mapboxgl-ctrl-geolocate')).not.toBeNull();
			expect(controlRef.current).toBeTruthy();
		} finally {
			act(() => view.unmount());
		}
	});

	// @parity-case ported:controls:4
	it('renders <NavigationControl />', async () => {
		const view = mount(NavigationControlMap, base() as any);
		try {
			await settle();
			expect(view.container.querySelector('.mapboxgl-ctrl-zoom-in')).not.toBeNull();
		} finally {
			act(() => view.unmount());
		}
	});

	// @parity-case ported:controls:5
	it('renders <ScaleControl />', async () => {
		const view = mount(ScaleControlMap, base({ scaleProps: {} }) as any);
		try {
			await settle();
			expect(view.container.querySelector('.mapboxgl-ctrl-scale')).not.toBeNull();
		} finally {
			act(() => view.unmount());
		}
	});

	// Per upstream/src/components/scale-control.ts:31 — unit and maxWidth are
	// pushed onto the live control during render, not through an effect.
	// @parity-case ported:controls:6
	it('pushes updated ScaleControl options onto the live control', async () => {
		const ref: { current: any } = { current: null };
		const view = mount(ScaleControlMap, base({ ref, scaleProps: { unit: 'metric' } }) as any);
		try {
			await settle();
			const [control] = ref.current.getMap()._controls;
			expect(control.options.unit).toBe('metric');

			view.update(
				ScaleControlMap,
				base({ ref, scaleProps: { unit: 'imperial', maxWidth: 200 } }) as any,
			);
			await settle();

			// The same control instance is reconfigured; a new one would mean the
			// control was torn down and re-added on every prop change.
			expect(ref.current.getMap()._controls[0]).toBe(control);
			expect(control.options.unit).toBe('imperial');
			expect(control.options.maxWidth).toBe(200);
		} finally {
			act(() => view.unmount());
		}
	});

	// Per upstream/src/components/use-control.ts:44 — a control is added once and
	// removed with the component, so remounting must not leave a stale control.
	// @parity-case ported:controls:7
	it('removes a control from the map when it leaves the tree', async () => {
		const view = mount(NavigationControlMap, base() as any);
		await settle();
		expect(view.container.querySelector('.mapboxgl-ctrl-zoom-in')).not.toBeNull();

		act(() => view.unmount());

		expect(view.container.querySelector('.mapboxgl-ctrl-zoom-in')).toBeNull();
	});
});
