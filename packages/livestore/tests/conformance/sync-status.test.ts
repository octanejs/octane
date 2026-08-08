import type { Store, SyncStatus } from '@livestore/livestore';
import { drainPassiveEffects, flushSync, hydrateRoot } from 'octane';
import { describe, expect, it, vi } from 'vitest';
import { act, flushEffects, mount } from '../_helpers';
import { SyncReader } from '../_fixtures/document-sync.tsrx';

describe('sync status', () => {
	it('reads synchronously, reacts to notifications, switches stores, and unsubscribes', async () => {
		const makeStore = function makeStore(initial: SyncStatus) {
			let status = initial;
			const listeners = new Set<(value: SyncStatus) => void>();
			const unsubscribe = vi.fn(function unsubscribeListener(
				listener: (value: SyncStatus) => void,
			) {
				listeners.delete(listener);
			});
			return {
				store: {
					syncStatus: function syncStatus() {
						return status;
					},
					subscribeSyncStatus(listener: (value: SyncStatus) => void) {
						listeners.add(listener);
						return function unsubscribeCurrent() {
							unsubscribe(listener);
						};
					},
				} as unknown as Store<any>,
				emit(next: SyncStatus) {
					status = next;
					for (const listener of listeners) listener(next);
				},
				listeners,
				unsubscribe,
			};
		};
		const pending = { isSynced: false, pendingCount: 1 } as SyncStatus;
		const synced = { isSynced: true, pendingCount: 0 } as SyncStatus;
		const stalePending = { isSynced: false, pendingCount: 9 } as SyncStatus;
		const first = makeStore(pending);
		const second = makeStore(synced);
		const result = mount(SyncReader, { store: first.store });
		flushEffects();

		expect(result.find('#sync').textContent).toContain('"isSynced":false');
		await act(function emitSynced() {
			first.emit(synced);
		});
		expect(result.find('#sync').textContent).toContain('"isSynced":true');

		result.update(SyncReader, { store: second.store });
		// Render has switched the tracked store, but the previous subscription is
		// still live until effect cleanup. A late emission must not win.
		await act(function emitStale() {
			first.emit(stalePending);
		});
		expect(result.find('#sync').textContent).toContain('"isSynced":true');
		expect(result.find('#sync').textContent).not.toContain('"pendingCount":9');

		flushEffects();
		expect(first.listeners.size).toBe(0);
		expect(second.listeners.size).toBe(1);
		expect(result.find('#sync').textContent).toContain('"isSynced":true');

		result.unmount();
		flushEffects();
		expect(second.listeners.size).toBe(0);
		expect(first.unsubscribe).toHaveBeenCalledTimes(1);
		expect(second.unsubscribe).toHaveBeenCalledTimes(1);
	});

	it('hydrates existing DOM and keeps the adopted host reactive', async () => {
		let status = { isSynced: false, pendingCount: 1 } as SyncStatus;
		const listeners = new Set<(value: SyncStatus) => void>();
		const store = {
			syncStatus: function syncStatus() {
				return status;
			},
			subscribeSyncStatus(listener: (value: SyncStatus) => void) {
				listeners.add(listener);
				return function unsubscribe() {
					listeners.delete(listener);
				};
			},
		} as unknown as Store<any>;
		const container = document.createElement('div');
		container.innerHTML = `<div id="sync">${JSON.stringify(status)}</div>`;
		document.body.appendChild(container);
		const serverHost = container.querySelector('#sync');

		const root = hydrateRoot(container, SyncReader, { store });
		drainPassiveEffects();
		expect(container.querySelector('#sync')).toBe(serverHost);

		status = { isSynced: true, pendingCount: 0 } as SyncStatus;
		await act(function emitHydrated() {
			for (const listener of listeners) listener(status);
		});
		expect(container.querySelector('#sync')).toBe(serverHost);
		expect(serverHost?.textContent).toContain('"isSynced":true');

		flushSync(function unmountHydrated() {
			root.unmount();
		});
		container.remove();
	});
});
