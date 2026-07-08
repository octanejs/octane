/**
 * Recharts redux plumbing conformance: useAppSelector/useChartLayout against a
 * real Redux Toolkit store provided through RechartsReduxContext (recharts'
 * isolated per-chart store pattern), the out-of-context fallbacks (undefined
 * selector result / no-op dispatch — recharts components stay usable
 * standalone), and the PanoramaContext flag.
 */
import { describe, it, expect } from 'vitest';
import { configureStore, createSlice } from '@reduxjs/toolkit';
import { mount, nextPaint } from '../_helpers';
import { LayoutApp, LayoutView, PanoramaApp, PanoramaProbe } from '../_fixtures/store-probe.tsrx';

const layoutSlice = createSlice({
	name: 'layout',
	initialState: { layoutType: 'horizontal' as string },
	reducers: {
		setLayoutType(state, action: { payload: string }) {
			state.layoutType = action.payload;
		},
	},
});

function makeChartStore() {
	return configureStore({ reducer: { layout: layoutSlice.reducer } });
}

async function flush() {
	for (let i = 0; i < 4; i++) {
		await new Promise((r) => setTimeout(r, 0));
		await nextPaint();
	}
}

describe('recharts redux plumbing', () => {
	it('useChartLayout reads the store through RechartsReduxContext and tracks dispatches', async () => {
		const store = makeChartStore();
		const r = mount(LayoutApp, { store });
		await flush();
		const btn = r.find('.layout') as HTMLElement;
		expect(btn.textContent).toBe('horizontal');
		// The fixture's click handler dispatches through useAppDispatch.
		btn.click();
		await flush();
		expect(store.getState().layout.layoutType).toBe('vertical');
		expect(btn.textContent).toBe('vertical');
		r.unmount();
	});

	it('outside a chart context the hooks fall back instead of throwing', async () => {
		const r = mount(LayoutView);
		await flush();
		const btn = r.find('.layout') as HTMLElement;
		expect(btn.textContent).toBe('undefined');
		btn.click(); // dispatch is a no-op outside the context
		await flush();
		expect(btn.textContent).toBe('undefined');
		r.unmount();
	});

	it('useIsPanorama reflects the PanoramaContext', async () => {
		const inside = mount(PanoramaApp);
		expect((inside.find('.pano') as HTMLElement).textContent).toBe('true');
		inside.unmount();
		const outside = mount(PanoramaProbe);
		expect((outside.find('.pano') as HTMLElement).textContent).toBe('false');
		outside.unmount();
	});
});
