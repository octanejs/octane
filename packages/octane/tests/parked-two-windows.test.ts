import { describe, expect, it } from 'vitest';
import { startTransition } from '../src/index.js';
import { act, mount } from './_helpers';
import { NestedKeyedRollback } from './_fixtures/parked-two-windows.tsrx';

function deferred<T>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((accept) => {
		resolve = accept;
	});
	return { promise, resolve };
}

function fulfilled(value: string): Promise<string> {
	return {
		status: 'fulfilled',
		value,
		then: (accept: (value: string) => void) => void accept(value),
	} as unknown as Promise<string>;
}

describe('keyed rows during suspended render', () => {
	it('runs committed row cleanup while its DOM is still connected', async () => {
		const api = {} as {
			setStep: (value: number) => void;
			setLocal: (value: number) => void;
			setSusp: (value: number) => void;
		};
		const cleanup: Array<{ id: string; connected: boolean }> = [];
		let rowB: Element | null = null;
		const root = mount(NestedKeyedRollback, {
			api,
			load: () => fulfilled('zero'),
			log: () => {},
			onLayoutCleanup: (id: string) => cleanup.push({ id, connected: rowB?.isConnected ?? false }),
		});
		try {
			await act(() => {});
			rowB = root.find('#row-b');
			await act(() => api.setStep(1));
			expect(root.findAll('#list li').map((row) => row.id)).toEqual([
				'row-a',
				'detail-a',
				'row-c',
				'detail-c',
			]);
			expect(cleanup).toEqual([{ id: 'b', connected: true }]);
			expect(rowB.isConnected).toBe(false);
		} finally {
			root.unmount();
		}
	});

	it('restores the original DOM after an earlier removal and a nested boundary rollback', async () => {
		const next = deferred<string>();
		const api = {} as {
			setStep: (value: number) => void;
			setLocal: (value: number) => void;
			setSusp: (value: number) => void;
		};
		const events: string[] = [];
		const root = mount(NestedKeyedRollback, {
			api,
			load: (step: number) => (step === 0 ? fulfilled('zero') : next.promise),
			log: (event: string) => events.push(event),
			onLayoutCleanup: (id: string) => events.push('layout-cleanup:' + id),
		});
		try {
			await act(() => {});
			const original = root.findAll('#list li');
			expect(original.map((row) => row.id)).toEqual([
				'row-a',
				'detail-a',
				'row-b',
				'detail-b',
				'row-c',
				'detail-c',
			]);
			expect(original[2].textContent).toBe('b!');
			expect(events).toEqual(['mount:a', 'mount:b', 'mount:c']);
			events.length = 0;

			await act(() => {
				api.setStep(1);
				startTransition(() => {
					api.setLocal(1);
					api.setSusp(1);
				});
			});
			const restored = root.findAll('#list li');
			expect(restored.map((row) => row.id)).toEqual(original.map((row) => row.id));
			expect(restored).toEqual(original);
			expect(original[2].isConnected).toBe(true);
			expect(original[3].isConnected).toBe(true);
			expect(root.findAll('#fallback')).toHaveLength(0);
			expect(events).toEqual([]);

			await act(() => api.setLocal(3));
			expect(root.findAll('#list li[id^="row-"]').map((row) => row.id)).toEqual([
				'row-a',
				'row-x',
				'row-b',
				'row-c',
			]);
			expect(root.find('#row-b')).toBe(original[2]);
			expect(root.find('#detail-b')).toBe(original[3]);
			expect(events).not.toContain('cleanup:b');
			expect(events).not.toContain('layout-cleanup:b');
		} finally {
			next.resolve('one');
			root.unmount();
		}
	});
});
