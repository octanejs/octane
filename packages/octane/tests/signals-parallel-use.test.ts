import { describe, expect, it } from 'vitest';
import { resolve } from 'node:path';
import { createScope } from 'octane/signals';
import { prerender } from 'octane/static';
import { act, mount } from './_helpers.js';
import { loadServerFixture } from './_server-fixture.js';
import * as client from './_fixtures/signals-parallel-use.tsrx';

const server = loadServerFixture<typeof client>(
	resolve(__dirname, '_fixtures/signals-parallel-use.tsrx'),
	{ compileOptions: { nativeReads: true } },
);

function deferred<T>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((done) => {
		resolve = done;
	});
	return { promise, resolve };
}

const drain = () => new Promise<void>((done) => setTimeout(done, 0));

describe('native reads in use() creations', () => {
	it.each([
		['root', client.NativeWarmParent],
		['boundary', client.NativeWarmBoundary],
	] as const)(
		'retains a refreshed warmed request through a %s first-mount retry',
		async (_kind, Parent) => {
			const scope = createScope({ scopeKey: 'native-warm-client-retry' });
			const count$ = scope.signal$('count', 1);
			const parent = deferred<string>();
			const requests: Array<{ value: number } & ReturnType<typeof deferred<string>>> = [];
			const make$ = () => {
				const request = { value: count$.get(), ...deferred<string>() };
				requests.push(request);
				return request.promise;
			};
			const rendered = mount(Parent, { make$, gate: () => parent.promise });
			try {
				expect(requests.map((request) => request.value)).toEqual([1]);
				count$.set(2);
				await act(() => parent.resolve('parent'));
				expect(requests.map((request) => request.value)).toEqual([1, 2]);
				await act(() => requests[1].resolve('current'));
				expect(rendered.find('.creation-value').textContent).toBe('current');
				expect(requests.map((request) => request.value)).toEqual([1, 2]);
			} finally {
				rendered.unmount();
				scope.dispose();
			}
		},
	);

	it('retains a root creation without a descendant warm plan', async () => {
		const scope = createScope({ scopeKey: 'native-root-creation-retry' });
		const count$ = scope.signal$('count', 1);
		const requests: Array<ReturnType<typeof deferred<string>>> = [];
		const make$ = () => {
			count$.get();
			const request = deferred<string>();
			requests.push(request);
			return request.promise;
		};
		const rendered = mount(client.NativeCreationValue, { make$ });
		try {
			expect(requests).toHaveLength(1);
			await act(() => requests[0].resolve('current'));
			expect(rendered.find('.creation-value').textContent).toBe('current');
			expect(requests).toHaveLength(1);
		} finally {
			rendered.unmount();
			scope.dispose();
		}
	});

	it('refreshes a creation after unchanged props replayed its accepted value', async () => {
		const scope = createScope({ scopeKey: 'native-use-client' });
		const count$ = scope.signal$('count', 1);
		const make$ = () => Promise.resolve('value:' + count$.get());
		const rendered = mount(client.NativeCreationBoundary, { make$, label: 'before' });
		try {
			await act(() => {});
			expect(rendered.find('.creation-value').textContent).toBe('value:1');
			rendered.update(client.NativeCreationBoundary, { make$, label: 'after' });
			await act(() => count$.set(2));
			expect(rendered.find('.label').textContent).toBe('after');
			expect(rendered.find('.creation-value').textContent).toBe('value:2');
		} finally {
			rendered.unmount();
			scope.dispose();
		}
	});

	it('replaces a server creation whose native input changed during suspension', async () => {
		const scope = createScope({ scopeKey: 'native-use-server' });
		const count$ = scope.signal$('count', 1);
		const first = deferred<string>();
		const second = deferred<string>();
		const started: number[] = [];
		const make$ = () => {
			const value = count$.get();
			started.push(value);
			return value === 1 ? first.promise : second.promise;
		};
		try {
			const done = prerender(server.NativeCreationBoundary, { make$ });
			await drain();
			expect(started).toEqual([1]);
			count$.set(2);
			first.resolve('obsolete');
			await drain();
			expect(started).toEqual([1, 2]);
			second.resolve('current');
			const output = await done;
			expect(output.html).toContain('current');
			expect(output.html).not.toContain('obsolete');
			expect(started).toEqual([1, 2]);
		} finally {
			scope.dispose();
		}
	});

	it('rechecks a warmed descendant before adopting it into final server markup', async () => {
		const scope = createScope({ scopeKey: 'native-warm-server' });
		const count$ = scope.signal$('count', 1);
		const parent = deferred<string>();
		const started: number[] = [];
		const make$ = () => {
			const value = count$.get();
			started.push(value);
			return Promise.resolve('child:' + value);
		};
		try {
			const done = prerender(server.NativeWarmParent, { make$, gate: () => parent.promise });
			await drain();
			expect(started).toEqual([1]);
			count$.set(2);
			parent.resolve('parent');
			const output = await done;
			expect(output.html).toContain('child:2');
			expect(output.html).not.toContain('child:1');
			expect(started).toEqual([1, 2]);
		} finally {
			scope.dispose();
		}
	});
});
