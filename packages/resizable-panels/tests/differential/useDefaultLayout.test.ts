import {
	act as octaneAct,
	cleanup as cleanupOctane,
	renderHook as renderOctaneHook,
} from '@octanejs/testing-library';
import {
	useDefaultLayout as useOctaneDefaultLayout,
	type LayoutStorage,
} from '@octanejs/resizable-panels';
import { act as reactAct, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { useDefaultLayout as useReactDefaultLayout } from 'react-resizable-panels';
import { afterEach, describe, expect, test, vi } from 'vitest';

type StorageTrace = Array<['get', string] | ['set', string, string]>;

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
	true;

function writes(trace: StorageTrace) {
	return trace.filter((entry): entry is ['set', string, string] => entry[0] === 'set');
}

function createStorage(initial: Record<string, string> = {}): {
	storage: LayoutStorage;
	trace: StorageTrace;
} {
	const values = new Map(Object.entries(initial));
	const trace: StorageTrace = [];
	return {
		storage: {
			getItem(key) {
				trace.push(['get', key]);
				return values.get(key) ?? null;
			},
			setItem(key, value) {
				trace.push(['set', key, value]);
				values.set(key, value);
			},
		},
		trace,
	};
}

afterEach(() => {
	cleanupOctane();
	vi.useRealTimers();
});

describe('react-resizable-panels useDefaultLayout differential', () => {
	test('identical restore and committed-layout checkpoints', () => {
		const key = 'react-resizable-panels:workspace:navigation:content';
		const initial = { [key]: JSON.stringify({ navigation: 30, content: 70 }) };
		const reactStorage = createStorage(initial);
		const octaneStorage = createStorage(initial);

		let reactCurrent!: ReturnType<typeof useReactDefaultLayout>;
		const reactContainer = document.createElement('div');
		const reactRoot = createRoot(reactContainer);
		function ReactHarness() {
			reactCurrent = useReactDefaultLayout({
				id: 'workspace',
				panelIds: ['navigation', 'content'],
				storage: reactStorage.storage,
				onlySaveAfterUserInteractions: true,
			});
			return null;
		}
		reactAct(() => reactRoot.render(createElement(ReactHarness)));
		const octane = renderOctaneHook(() =>
			useOctaneDefaultLayout({
				id: 'workspace',
				panelIds: ['navigation', 'content'],
				storage: octaneStorage.storage,
				onlySaveAfterUserInteractions: true,
			}),
		);

		// Checkpoint 1: effects have restored the seeded layout and read key.
		const restoredLayout = { navigation: 30, content: 70 };
		expect(octane.result.current.defaultLayout).toEqual(restoredLayout);
		expect(reactCurrent.defaultLayout).toEqual(restoredLayout);
		expect(octane.result.current.defaultLayout).toEqual(reactCurrent.defaultLayout);
		expect(octaneStorage.trace.some((entry) => entry[0] === 'get' && entry[1] === key)).toBe(true);
		expect(reactStorage.trace.some((entry) => entry[0] === 'get' && entry[1] === key)).toBe(true);

		reactAct(() =>
			reactCurrent.onLayoutChanged({ navigation: 40, content: 60 }, { isUserInteraction: false }),
		);
		octaneAct(() =>
			octane.result.current.onLayoutChanged(
				{ navigation: 40, content: 60 },
				{ isUserInteraction: false },
			),
		);

		// Checkpoint 2: the same non-user trigger is filtered synchronously.
		expect(writes(octaneStorage.trace)).toEqual([]);
		expect(writes(reactStorage.trace)).toEqual([]);
		expect(writes(octaneStorage.trace)).toEqual(writes(reactStorage.trace));

		const committedLayout = { navigation: 45, content: 55 };
		const expectedWrite: ['set', string, string] = ['set', key, JSON.stringify(committedLayout)];
		reactAct(() => reactCurrent.onLayoutChanged(committedLayout, { isUserInteraction: true }));
		octaneAct(() =>
			octane.result.current.onLayoutChanged(committedLayout, { isUserInteraction: true }),
		);

		// Checkpoint 3: the same user trigger commits the same key and payload.
		expect(writes(octaneStorage.trace)).toEqual([expectedWrite]);
		expect(writes(reactStorage.trace)).toEqual([expectedWrite]);
		expect(writes(octaneStorage.trace)).toEqual(writes(reactStorage.trace));
		reactAct(() => reactRoot.unmount());
	});

	test('identical deprecated debounce checkpoints and cancellation', () => {
		vi.useFakeTimers();
		const key = 'react-resizable-panels:workspace';
		const pendingLayout = { navigation: 20, content: 80 };
		const expectedWrite: ['set', string, string] = ['set', key, JSON.stringify(pendingLayout)];
		const reactStorage = createStorage();
		const octaneStorage = createStorage();
		let reactCurrent!: ReturnType<typeof useReactDefaultLayout>;
		const reactContainer = document.createElement('div');
		const reactRoot = createRoot(reactContainer);
		function ReactHarness() {
			reactCurrent = useReactDefaultLayout({
				id: 'workspace',
				storage: reactStorage.storage,
				debounceSaveMs: 20,
			});
			return null;
		}
		reactAct(() => reactRoot.render(createElement(ReactHarness)));
		const octane = renderOctaneHook(() =>
			useOctaneDefaultLayout({
				id: 'workspace',
				storage: octaneStorage.storage,
				debounceSaveMs: 20,
			}),
		);

		reactAct(() => reactCurrent.onLayoutChange(pendingLayout));
		octaneAct(() => octane.result.current.onLayoutChange(pendingLayout));

		// Checkpoint 1: neither implementation writes synchronously.
		expect(writes(octaneStorage.trace)).toEqual([]);
		expect(writes(reactStorage.trace)).toEqual([]);
		expect(writes(octaneStorage.trace)).toEqual(writes(reactStorage.trace));

		reactAct(() => vi.advanceTimersByTime(19));
		// Checkpoint 2: both remain pending before the debounce boundary.
		expect(writes(octaneStorage.trace)).toEqual([]);
		expect(writes(reactStorage.trace)).toEqual([]);
		expect(writes(octaneStorage.trace)).toEqual(writes(reactStorage.trace));

		reactAct(() => vi.advanceTimersByTime(1));
		// Checkpoint 3: both commit the same payload at the boundary.
		expect(writes(octaneStorage.trace)).toEqual([expectedWrite]);
		expect(writes(reactStorage.trace)).toEqual([expectedWrite]);
		expect(writes(octaneStorage.trace)).toEqual(writes(reactStorage.trace));

		reactAct(() => reactCurrent.onLayoutChange({ navigation: 25, content: 75 }));
		octaneAct(() => octane.result.current.onLayoutChange({ navigation: 25, content: 75 }));
		reactAct(() => reactRoot.unmount());
		octane.unmount();
		reactAct(() => vi.runAllTimers());

		// Checkpoint 4: unmount cancels both pending commits; boundary write remains.
		expect(writes(octaneStorage.trace)).toEqual([expectedWrite]);
		expect(writes(reactStorage.trace)).toEqual([expectedWrite]);
		expect(writes(octaneStorage.trace)).toEqual(writes(reactStorage.trace));
	});
});
