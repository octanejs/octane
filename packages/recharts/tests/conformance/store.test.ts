/**
 * Recharts redux plumbing conformance: useAppSelector/useChartLayout against a
 * real Redux Toolkit store provided through RechartsReduxContext (recharts'
 * isolated per-chart store pattern), the out-of-context fallbacks (undefined
 * selector result / no-op dispatch — recharts components stay usable
 * standalone), and the PanoramaContext flag.
 */
import { describe, it, expect, vi } from 'vitest';
import { configureStore, createSlice } from '@reduxjs/toolkit';
import { mount, nextPaint } from '../_helpers';
import { referenceElementsReducer } from '../../src/state/referenceElementsSlice';
import { createRechartsStore } from '../../src/state/store';
import { externalEventAction } from '../../src/state/externalEventsMiddleware';
import type { MouseHandlerDataParam } from '../../src/synchronisation/types';
import {
	LayoutApp,
	LayoutView,
	PanoramaApp,
	PanoramaProbe,
	ReferenceLineReporterApp,
} from '../_fixtures/store-probe.tsrx';

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
	it('preserves native event targets and methods in throttled chart handlers', async () => {
		const store = createRechartsStore();
		const wrapper = document.createElement('div');
		const observed: Array<{
			currentTarget: EventTarget | null;
			target: EventTarget | null;
			clientX: number;
		}> = [];
		const handler = vi.fn((_state: MouseHandlerDataParam, event: MouseEvent) => {
			observed.push({
				currentTarget: event.currentTarget,
				target: event.target,
				clientX: event.clientX,
			});
			event.preventDefault();
		});
		wrapper.addEventListener('mousemove', (event) => {
			store.dispatch(externalEventAction({ handler, reactEvent: event }));
		});
		const event = new MouseEvent('mousemove', { bubbles: true, cancelable: true, clientX: 42 });
		wrapper.dispatchEvent(event);
		expect(handler).not.toHaveBeenCalled();
		await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
		expect(observed).toEqual([{ currentTarget: wrapper, target: wrapper, clientX: 42 }]);
		expect(event.defaultPrevented).toBe(true);
	});

	it('keeps an equivalent ReferenceLine registration stable across parent rerenders', async () => {
		const actions: string[] = [];
		const store = configureStore({
			reducer: { referenceElements: referenceElementsReducer },
			middleware: (getDefaultMiddleware) =>
				getDefaultMiddleware().concat(() => (next) => (action: { type: string }) => {
					actions.push(action.type);
					return next(action);
				}),
		});
		const settings = {
			xAxisId: 0,
			yAxisId: 0,
			ifOverflow: 'discard',
			segment: [
				{ x: 1, y: 2 },
				{ x: 3, y: 4 },
			],
		};
		const result = mount(ReferenceLineReporterApp, { store, settings });
		await flush();
		result.update(ReferenceLineReporterApp, {
			store,
			settings: {
				...settings,
				segment: [
					{ x: 1, y: 2 },
					{ x: 3, y: 4 },
				],
			},
		});
		await flush();
		expect(actions).toEqual(['referenceElements/addLine']);
		expect(store.getState().referenceElements.lines).toHaveLength(1);

		result.update(ReferenceLineReporterApp, {
			store,
			settings: {
				...settings,
				segment: [
					{ x: 1, y: 2 },
					{ x: 5, y: 6 },
				],
			},
		});
		await flush();
		expect(actions).toEqual([
			'referenceElements/addLine',
			'referenceElements/removeLine',
			'referenceElements/addLine',
		]);
		expect(store.getState().referenceElements.lines).toHaveLength(1);
		result.unmount();
	});

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
