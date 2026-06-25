/**
 * Suspense + error-boundary integration: a `suspense: true` query throws its
 * in-flight promise (caught by octane's `@pending`) and, on error, throws the
 * error (caught by `@catch`) — the octane equivalents of React Suspense /
 * ErrorBoundary.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { QueryClient } from '@octane-ts/query';
import { mount, nextPaint } from '../_helpers';
import { SuspenseApp, SuspenseComponentApp } from '../_fixtures/suspense.tsrx';

let client: QueryClient;
beforeEach(() => {
	client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
	client.mount();
});

async function flush() {
	for (let i = 0; i < 6; i++) {
		await new Promise((r) => setTimeout(r, 0));
		await nextPaint();
	}
}

describe('suspense query', () => {
	it('shows @pending while loading, then the data', async () => {
		let resolveFn: (v: string) => void = () => {};
		const queryFn = () => new Promise<string>((res) => (resolveFn = res));
		const r = mount(SuspenseApp, { client, queryFn });
		// First render suspends → @pending fallback.
		expect(r.find('#fallback').textContent).toBe('loading');
		await flush();
		resolveFn('ready');
		await flush();
		expect(r.find('#data').textContent).toBe('data:ready');
		r.unmount();
	});

	it('shows @catch when the suspense query errors', async () => {
		let rejectFn: (e: Error) => void = () => {};
		const queryFn = () => new Promise<string>((_res, rej) => (rejectFn = rej));
		const r = mount(SuspenseApp, { client, queryFn });
		expect(r.find('#fallback').textContent).toBe('loading');
		await flush();
		rejectFn(new Error('nope'));
		await flush();
		expect(r.find('#caught').textContent).toBe('caught:nope');
		r.unmount();
	});

	it('works with octane’s <Suspense> component (not just @try)', async () => {
		let resolveFn: (v: string) => void = () => {};
		const queryFn = () => new Promise<string>((res) => (resolveFn = res));
		const r = mount(SuspenseComponentApp, { client, queryFn });
		expect(r.find('#fallback').textContent).toBe('loading');
		await flush();
		resolveFn('ready');
		await flush();
		expect(r.find('#data').textContent).toBe('data:ready');
		r.unmount();
	});
});
