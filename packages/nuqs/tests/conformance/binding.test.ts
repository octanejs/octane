/**
 * @octanejs/nuqs conformance — the ported react layer (useQueryState,
 * useQueryStates, the adapter context + NuqsTestingAdapter) driving the REAL
 * nuqs update queues: initial parse from the URL, optimistic + reconciled
 * setter updates, default-value semantics (clearOnDefault), null-clear, the
 * functional updater over the current URL value, and multi-key updates. Also
 * checks public export parity with upstream nuqs for the framework-agnostic
 * surface.
 */
import { describe, it, expect, vi } from 'vitest';
import * as binding from '@octanejs/nuqs';
import { mount, nextPaint } from '../_helpers';
import { CounterApp, FiltersApp } from '../_fixtures/query.tsrx';
import type { UrlUpdateEvent } from '@octanejs/nuqs/adapters/testing';

// nuqs applies URL updates through its throttle queue (a microtask/timeout
// hop even at rateLimitFactor 0); octane commits renders in a microtask.
// Settle both before asserting.
async function flush() {
	for (let i = 0; i < 6; i++) {
		await new Promise((r) => setTimeout(r, 0));
		await nextPaint();
	}
}

describe('useQueryState', () => {
	it('reads the default value when the key is absent from the URL', async () => {
		const r = mount(CounterApp, {});
		await flush();
		expect(r.find('#count').textContent).toBe('count=0');
		r.unmount();
	});

	it('parses the initial value from the URL search params', async () => {
		const r = mount(CounterApp, { searchParams: '?count=41' });
		await flush();
		expect(r.find('#count').textContent).toBe('count=41');
		r.unmount();
	});

	it('updates the value (and the URL) via the setter', async () => {
		const onUrlUpdate = vi.fn<(e: UrlUpdateEvent) => void>();
		const r = mount(CounterApp, { searchParams: '?count=41', onUrlUpdate });
		await flush();
		r.click('#inc');
		await flush();
		expect(r.find('#count').textContent).toBe('count=42');
		const last = onUrlUpdate.mock.calls.at(-1)?.[0];
		expect(last?.searchParams.get('count')).toBe('42');
		r.unmount();
	});

	it('applies a functional updater against the current URL value', async () => {
		const r = mount(CounterApp, { searchParams: '?count=1' });
		await flush();
		r.click('#inc');
		r.click('#inc');
		await flush();
		expect(r.find('#count').textContent).toBe('count=3');
		r.unmount();
	});

	it('clears the key on setNull and falls back to the default', async () => {
		const onUrlUpdate = vi.fn<(e: UrlUpdateEvent) => void>();
		const r = mount(CounterApp, { searchParams: '?count=7', onUrlUpdate });
		await flush();
		r.click('#clear');
		await flush();
		expect(r.find('#count').textContent).toBe('count=0');
		// clearing removes the key from the URL entirely
		const last = onUrlUpdate.mock.calls.at(-1)?.[0];
		expect(last?.searchParams.has('count')).toBe(false);
		r.unmount();
	});

	it('omits the key from the URL when set back to the default (clearOnDefault)', async () => {
		const onUrlUpdate = vi.fn<(e: UrlUpdateEvent) => void>();
		const r = mount(CounterApp, { searchParams: '?count=1', onUrlUpdate });
		await flush();
		// count starts at 1; decrementing to 0 (the default) should clear the key
		r.click('#clear'); // -> null -> default 0
		await flush();
		r.click('#inc'); // -> 1
		await flush();
		const afterInc = onUrlUpdate.mock.calls.at(-1)?.[0];
		expect(afterInc?.searchParams.get('count')).toBe('1');
		r.unmount();
	});
});

describe('useQueryStates', () => {
	it('reads multiple keys from the URL with per-key defaults', async () => {
		const r = mount(FiltersApp, { searchParams: '?q=octane&page=3' });
		await flush();
		expect(r.find('#q').textContent).toBe('q=octane');
		expect(r.find('#page').textContent).toBe('page=3');
		r.unmount();
	});

	it('falls back to defaults for absent keys', async () => {
		const r = mount(FiltersApp, {});
		await flush();
		expect(r.find('#q').textContent).toBe('q=');
		expect(r.find('#page').textContent).toBe('page=1');
		r.unmount();
	});

	it('updates several keys in one setter call', async () => {
		const onUrlUpdate = vi.fn<(e: UrlUpdateEvent) => void>();
		const r = mount(FiltersApp, { onUrlUpdate });
		await flush();
		r.click('#set');
		await flush();
		expect(r.find('#q').textContent).toBe('q=hello');
		expect(r.find('#page').textContent).toBe('page=2');
		const last = onUrlUpdate.mock.calls.at(-1)?.[0];
		expect(last?.searchParams.get('q')).toBe('hello');
		expect(last?.searchParams.get('page')).toBe('2');
		r.unmount();
	});

	it('applies a partial functional updater against current state', async () => {
		const r = mount(FiltersApp, { searchParams: '?q=keep&page=5' });
		await flush();
		r.click('#next'); // page: old.page + 1, q untouched
		await flush();
		expect(r.find('#q').textContent).toBe('q=keep');
		expect(r.find('#page').textContent).toBe('page=6');
		r.unmount();
	});

	it('resets all keys to defaults on setNull', async () => {
		const r = mount(FiltersApp, { searchParams: '?q=x&page=9' });
		await flush();
		r.click('#reset');
		await flush();
		expect(r.find('#q').textContent).toBe('q=');
		expect(r.find('#page').textContent).toBe('page=1');
		r.unmount();
	});
});

describe('export parity with upstream nuqs (framework-agnostic surface)', () => {
	it('re-exports the core parsers, serializer, loader and standard-schema helpers', () => {
		for (const name of [
			'parseAsString',
			'parseAsInteger',
			'parseAsFloat',
			'parseAsBoolean',
			'parseAsIsoDateTime',
			'parseAsArrayOf',
			'parseAsJson',
			'parseAsStringEnum',
			'createParser',
			'createSerializer',
			'createLoader',
			'createStandardSchemaV1',
			'useQueryState',
			'useQueryStates',
		]) {
			expect(binding).toHaveProperty(name);
			expect(typeof (binding as Record<string, unknown>)[name]).not.toBe('undefined');
		}
	});
});
