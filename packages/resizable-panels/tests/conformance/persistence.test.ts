import { act, cleanup, renderHook } from '@octanejs/testing-library';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useDefaultLayout } from '@octanejs/resizable-panels';

function createStorage(initial: Record<string, string> = {}) {
	const values = new Map(Object.entries(initial));
	return {
		getItem: vi.fn((key: string) => values.get(key) ?? null),
		setItem: vi.fn((key: string, value: string) => values.set(key, value)),
	};
}

afterEach(cleanup);

describe('useDefaultLayout persistence', () => {
	beforeEach(() => vi.useRealTimers());

	it('restores modern layouts and uses the panel-id-specific storage key', () => {
		const storage = createStorage({
			'react-resizable-panels:mail:list:detail': '{"list":35,"detail":65}',
		});
		const { result } = renderHook(() =>
			useDefaultLayout({ id: 'mail', panelIds: ['list', 'detail'], storage }),
		);

		expect(result.current.defaultLayout).toEqual({ list: 35, detail: 65 });
		expect(storage.getItem).toHaveBeenCalledWith('react-resizable-panels:mail:list:detail');
	});

	it('falls back from malformed modern data to matching legacy data', () => {
		const storage = createStorage({
			'react-resizable-panels:mail:list:detail': '{not-json',
			'react-resizable-panels:mail': JSON.stringify({
				'list,detail': { expandToSizes: {}, layout: [40, 60] },
			}),
		});
		const { result } = renderHook(() =>
			useDefaultLayout({ groupId: 'mail', panelIds: ['list', 'detail'], storage }),
		);

		expect(result.current.defaultLayout).toEqual({ list: 40, detail: 60 });
	});

	it('returns no default for missing, invalid, or blocked storage', () => {
		const missing = renderHook(() => useDefaultLayout({ id: 'missing', storage: createStorage() }));
		expect(missing.result.current.defaultLayout).toBeUndefined();
		missing.unmount();

		const blocked = {
			getItem: vi.fn(() => {
				throw new Error('blocked');
			}),
			setItem: vi.fn(),
		};
		const denied = renderHook(() => useDefaultLayout({ id: 'blocked', storage: blocked }));
		expect(denied.result.current.defaultLayout).toBeUndefined();
		act(() =>
			denied.result.current.onLayoutChanged({ list: 45, detail: 55 }, { isUserInteraction: true }),
		);
		expect(blocked.setItem).toHaveBeenCalledWith(
			'react-resizable-panels:blocked',
			'{"list":45,"detail":55}',
		);
	});

	it('saves committed layouts immediately and filters non-user commits when requested', () => {
		const storage = createStorage();
		const { result } = renderHook(() =>
			useDefaultLayout({
				id: 'mail',
				panelIds: ['list', 'detail'],
				storage,
				onlySaveAfterUserInteractions: true,
			}),
		);

		act(() =>
			result.current.onLayoutChanged({ list: 45, detail: 55 }, { isUserInteraction: false }),
		);
		expect(storage.setItem).not.toHaveBeenCalled();
		act(() =>
			result.current.onLayoutChanged({ list: 45, detail: 55 }, { isUserInteraction: true }),
		);
		expect(storage.setItem).toHaveBeenCalledWith(
			'react-resizable-panels:mail:list:detail',
			'{"list":45,"detail":55}',
		);
	});

	it('persists to default localStorage after the restore rerender', () => {
		localStorage.clear();
		const { result } = renderHook(() => useDefaultLayout({ id: 'local' }));

		act(() =>
			result.current.onLayoutChanged({ list: 45, detail: 55 }, { isUserInteraction: true }),
		);
		expect(localStorage.getItem('react-resizable-panels:local')).toBe('{"list":45,"detail":55}');
	});

	it('keeps the deprecated callback debounced and cancels pending saves on unmount', () => {
		vi.useFakeTimers();
		const storage = createStorage();
		const first = renderHook(() => useDefaultLayout({ id: 'mail', storage, debounceSaveMs: 20 }));

		act(() => first.result.current.onLayoutChange({ list: 20, detail: 80 }));
		expect(storage.setItem).not.toHaveBeenCalled();
		act(() => vi.advanceTimersByTime(20));
		expect(storage.setItem).toHaveBeenCalledTimes(1);

		act(() => first.result.current.onLayoutChange({ list: 30, detail: 70 }));
		first.unmount();
		act(() => vi.runAllTimers());
		expect(storage.setItem).toHaveBeenCalledTimes(1);
	});
});
