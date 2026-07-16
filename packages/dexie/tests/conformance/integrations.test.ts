import Dexie from 'dexie';
import { afterEach, describe, expect, it } from 'vitest';
import { flushEffects, mount, nextPaint } from '../_helpers';
import {
	PermissionReader,
	SequentialSuspendingValues,
	SuspendingBoundary,
} from '../_fixtures/integrations.tsrx';

function deferred<T>() {
	let resolve!: (value: T) => void;
	let reject!: (error: unknown) => void;
	const promise = new Promise<T>((res, rej) => {
		resolve = res;
		reject = rej;
	});
	return { promise, resolve, reject };
}

class PermissionObservable {
	listeners = new Set<(value: { add: (...tables: string[]) => boolean }) => void>();

	subscribe(onNext: (value: { add: (...tables: string[]) => boolean }) => void) {
		this.listeners.add(onNext);
		return () => this.listeners.delete(onNext);
	}

	emit(value: { add: (...tables: string[]) => boolean }) {
		for (const listener of [...this.listeners]) listener(value);
	}
}

const databases: Dexie[] = [];

afterEach(async () => {
	for (const db of databases.splice(0)) await db.delete();
});

async function flush() {
	for (let i = 0; i < 4; i++) {
		await new Promise((resolve) => setTimeout(resolve, 0));
		await nextPaint();
	}
}

describe('suspending live queries', () => {
	it('shows pending UI and then renders the first result', async () => {
		const pending = deferred<string>();
		const result = mount(SuspendingBoundary, {
			querier: () => pending.promise,
			cacheKey: ['single'],
		});
		await flush();
		expect(result.find('#suspending-pending').textContent).toBe('loading');

		pending.resolve('loaded');
		await flush();
		expect(result.find('#suspending-value').textContent).toBe('loaded');
		result.unmount();
	});

	it('keeps sequential suspensions pending until both values resolve', async () => {
		const first = deferred<string>();
		const second = deferred<string>();
		const result = mount(SequentialSuspendingValues, {
			firstQuerier: () => first.promise,
			secondQuerier: () => second.promise,
		});
		await flush();
		expect(result.find('#sequential-pending').textContent).toBe('loading');

		first.resolve('one');
		await flush();
		expect(result.find('#sequential-pending').textContent).toBe('loading');

		second.resolve('two');
		await flush();
		expect(result.find('#suspending-value').textContent).toBe('one');
		expect(result.findAll('#suspending-value')[1].textContent).toBe('two');
		result.unmount();
	});

	it('routes a rejected suspending query to the catch boundary', async () => {
		const pending = deferred<string>();
		const result = mount(SuspendingBoundary, {
			querier: () => pending.promise,
			cacheKey: ['rejection'],
		});
		await flush();
		pending.reject(new Error('suspending failed'));
		await flush();
		expect(result.find('#suspending-error').textContent).toBe('suspending failed');
		result.unmount();
	});

	// Per Bugbot discussion_r3597801534: a new cacheKey must not keep throwing a prior entry's error.
	it('recovers when remounting with a new cacheKey after a suspending rejection', async () => {
		const failing = deferred<string>();
		const first = mount(SuspendingBoundary, {
			querier: () => failing.promise,
			cacheKey: ['stale-error-a'],
		});
		await flush();
		failing.reject(new Error('first key failed'));
		await flush();
		expect(first.find('#suspending-error').textContent).toBe('first key failed');
		first.unmount();
		await flush();

		const recovered = deferred<string>();
		const second = mount(SuspendingBoundary, {
			querier: () => recovered.promise,
			cacheKey: ['stale-error-b'],
		});
		await flush();
		expect(second.find('#suspending-pending').textContent).toBe('loading');
		recovered.resolve('recovered');
		await flush();
		expect(second.find('#suspending-value').textContent).toBe('recovered');
		second.unmount();
	});

	it('switches to a new cache entry when cacheKey changes on a mounted reader', async () => {
		const first = deferred<string>();
		const result = mount(SuspendingBoundary, {
			querier: () => first.promise,
			cacheKey: ['switch-a'],
		});
		await flush();
		first.resolve('alpha');
		await flush();
		expect(result.find('#suspending-value').textContent).toBe('alpha');

		const second = deferred<string>();
		result.update(SuspendingBoundary, {
			querier: () => second.promise,
			cacheKey: ['switch-b'],
		});
		await flush();
		expect(result.find('#suspending-pending').textContent).toBe('loading');
		second.resolve('beta');
		await flush();
		expect(result.find('#suspending-value').textContent).toBe('beta');
		result.unmount();
	});

	// Upstream handleFinalize clears the settled promise so the same key can retry.
	// The querier must be stable: the cache reuses the first liveQuery for the key.
	it('allows retrying the same cacheKey after a suspending rejection', async () => {
		let attempts = 0;
		const pending: Array<ReturnType<typeof deferred<string>>> = [];
		const querier = () => {
			const request = deferred<string>();
			pending[attempts++] = request;
			return request.promise;
		};

		const first = mount(SuspendingBoundary, {
			querier,
			cacheKey: ['same-key-retry'],
		});
		await flush();
		expect(attempts).toBe(1);
		pending[0]!.reject(new Error('temporary failure'));
		await flush();
		expect(first.find('#suspending-error').textContent).toBe('temporary failure');
		first.unmount();
		await flush();

		const second = mount(SuspendingBoundary, {
			querier,
			cacheKey: ['same-key-retry'],
		});
		await flush();
		expect(second.find('#suspending-pending').textContent).toBe('loading');
		expect(attempts).toBe(2);
		pending[1]!.resolve('retried');
		await flush();
		expect(second.find('#suspending-value').textContent).toBe('retried');
		second.unmount();
	});
});

describe('usePermissions', () => {
	it('subscribes to the Dexie Cloud permission observable', async () => {
		const db = new Dexie('octane-dexie-permissions');
		databases.push(db);
		const observable = new PermissionObservable();
		(db as any).cloud = {
			permissions: () => observable,
		};
		const result = mount(PermissionReader, {
			db,
			table: 'items',
			obj: { realmId: 'realm', owner: 'owner' },
		});
		flushEffects();
		observable.emit({ add: () => true });
		await flush();
		expect(result.find('#permission').textContent).toBe('add=true');
		result.unmount();
	});

	it('rejects databases without Dexie Cloud permissions', () => {
		const db = new Dexie('octane-dexie-no-permissions');
		expect(() =>
			mount(PermissionReader, {
				db,
				table: 'items',
				obj: {},
			}),
		).toThrow(/Dexie Cloud/);
	});
});
