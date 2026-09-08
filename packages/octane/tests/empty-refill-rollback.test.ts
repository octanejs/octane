import { describe, expect, it } from 'vitest';
import { act, mount } from './_helpers';
import {
	EmptyRefillRollback,
	NestedCommitEmptyRefill,
} from './_fixtures/empty-refill-rollback.tsrx';

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

describe('keyed @empty rollback', () => {
	it('runs committed row cleanups while their DOM remains connected after a nested hold', async () => {
		const pending = deferred<string>();
		const api = {} as {
			setStep: (value: number) => void;
			setLocal: (value: number) => void;
			setSusp: (value: number) => void;
		};
		const events: string[] = [];
		const cleanupConnected: Array<{ id: string; connected: boolean }> = [];
		const rows = new Map<string, Element>();
		const r = mount(NestedCommitEmptyRefill, {
			api,
			load: (step: number) => (step === 0 ? fulfilled('zero') : pending.promise),
			log: (entry: string) => events.push(entry),
			onLayoutCleanup: (id: string) => {
				cleanupConnected.push({ id, connected: rows.get(id)?.isConnected ?? false });
			},
		});
		try {
			await act(() => {});
			for (const id of ['a', 'b', 'c']) rows.set(id, r.find('#row-' + id));
			events.length = 0;

			await act(() => api.setStep(1));

			expect(r.findAll('#list li').map((node) => node.id)).toEqual(['empty']);
			expect(r.findAll('#fallback')).toHaveLength(1);
			expect(r.findAll('#row-d')).toHaveLength(0);
			expect([...rows.values()].every((node) => !node.isConnected)).toBe(true);
			expect(events.sort()).toEqual(['cleanup:a', 'cleanup:b', 'cleanup:c']);
			expect(cleanupConnected.sort((a, b) => a.id.localeCompare(b.id))).toEqual([
				{ id: 'a', connected: true },
				{ id: 'b', connected: true },
				{ id: 'c', connected: true },
			]);
		} finally {
			pending.resolve('one');
			r.unmount();
		}
	});

	it.each([
		{ name: 'a multi-node row list', size: undefined },
		{ name: 'a large owned list', size: 1000 },
	])('keeps $name connected and reusable after a same-drain refill', async ({ size }) => {
		const pending = deferred<string>();
		const api = {} as {
			setStep: (value: number) => void;
			setLocal: (value: number) => void;
			setSusp: (value: number) => void;
		};
		const events: string[] = [];
		const cleanupConnected: Array<{ id: string; connected: boolean }> = [];
		const rowNodes = new Map<string, Element>();
		let initialRows: Element[] = [];
		const r = mount(EmptyRefillRollback, {
			api,
			size,
			load: (step: number) => (step === 0 ? fulfilled('zero') : pending.promise),
			log: (entry: string) => events.push(entry),
			onLayoutCleanup: (id: string) => {
				const row = rowNodes.get(id);
				cleanupConnected.push({ id, connected: row?.isConnected ?? false });
			},
		});
		try {
			await act(() => {});
			initialRows = r.findAll('#list li');
			expect(initialRows).toHaveLength(size === undefined ? 6 : size);
			if (size === undefined) {
				for (const id of ['a', 'b', 'c']) rowNodes.set(id, r.find('#row-' + id));
			}
			events.length = 0;

			await act(() => api.setStep(1));

			const held = r.findAll('#list li');
			expect(held).toHaveLength(initialRows.length);
			for (let index = 0; index < held.length; index++)
				expect(held[index]).toBe(initialRows[index]);
			expect(initialRows.every((node) => node.isConnected)).toBe(true);
			expect(r.findAll('#empty')).toHaveLength(0);
			expect(r.findAll('#row-d')).toHaveLength(0);
			expect(r.findAll('#fallback')).toHaveLength(0);
			expect(events).toEqual([]);
			expect(cleanupConnected).toEqual([]);

			await act(() => api.setLocal(3));
			const ids =
				size === undefined ? ['a', 'b', 'c'] : Array.from({ length: size }, (_, i) => String(i));
			expect(r.findAll('#list li[id^="row-"]').map((row) => row.id)).toEqual([
				'row-' + ids[0],
				'row-x',
				...ids.slice(1).map((id) => 'row-' + id),
			]);
			expect(r.find('#row-' + ids[1])).toBe(initialRows[size === undefined ? 2 : 1]);
			if (size === undefined) {
				rowNodes.set('x', r.find('#row-x'));
				expect(r.find('#detail-b')).toBe(initialRows[3]);
				expect(r.find('#row-b').textContent).toBe('b!');
			}
			expect(events).toEqual(size === undefined ? ['mount:x'] : []);
			expect(cleanupConnected).toEqual([]);
			if (size === undefined) {
				await act(() => pending.resolve('one'));
				await act(() => api.setLocal(2));
				expect(r.findAll('#list li').map((node) => node.id)).toEqual(['empty']);
				expect(events.filter((entry) => entry.startsWith('cleanup:')).sort()).toEqual([
					'cleanup:a',
					'cleanup:b',
					'cleanup:c',
					'cleanup:x',
				]);
				expect(cleanupConnected.sort((a, b) => a.id.localeCompare(b.id))).toEqual([
					{ id: 'a', connected: true },
					{ id: 'b', connected: true },
					{ id: 'c', connected: true },
					{ id: 'x', connected: true },
				]);
			}
		} finally {
			pending.resolve('one');
			r.unmount();
		}
	});
});
