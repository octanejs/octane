import { describe, expect, it } from 'vitest';
import { mount, settle } from '../_helpers';
import {
	InfiniteApp,
	LazyMutationApp,
	NestedApiProviderApp,
	QueryApp,
	SkipPrefetchApp,
	CustomContextApp,
} from '../_fixtures/rtk-query.tsrx';

async function unmountAndSettle(result: { unmount(): void }): Promise<void> {
	result.unmount();
	// RTK Query releases its subscriptions through passive cleanup. Keep that
	// post-paint work inside the fixture's jsdom lifetime instead of letting a
	// queued animation frame race environment teardown under a loaded CI shard.
	await settle();
}

describe('RTK Query generated hooks', () => {
	it('keeps two calls to the same endpoint isolated and updates their data', async () => {
		const result = mount(QueryApp, {});
		expect(result.find('#first').textContent).toContain('pending');
		expect(result.find('#second').textContent).toContain('pending');

		await settle();
		expect(result.find('#first').textContent).toBe('first=value-a:fulfilled');
		expect(result.find('#second').textContent).toBe('second=value-b:fulfilled');
		expect(result.find('#selected').textContent).toBe('selected=value-selected');

		result.find('#swap').dispatchEvent(new MouseEvent('click', { bubbles: true }));
		await settle();
		expect(result.find('#first').textContent).toBe('first=value-c:fulfilled');
		expect(result.find('#second').textContent).toBe('second=value-b:fulfilled');
		await unmountAndSettle(result);
	});

	it('supports lazy queries and mutations, including reset', async () => {
		const result = mount(LazyMutationApp, {});
		expect(result.find('#lazy').textContent).toContain('uninitialized');
		expect(result.find('#mutation').textContent).toContain('uninitialized');

		result.find('#load').dispatchEvent(new MouseEvent('click', { bubbles: true }));
		result.find('#mutate').dispatchEvent(new MouseEvent('click', { bubbles: true }));
		await settle();
		expect(result.find('#lazy').textContent).toBe('lazy=value-lazy:fulfilled');
		expect(result.find('#mutation').textContent).toBe('mutation=mutated-mutation:fulfilled');

		result.find('#reset-lazy').dispatchEvent(new MouseEvent('click', { bubbles: true }));
		result.find('#reset-mutation').dispatchEvent(new MouseEvent('click', { bubbles: true }));
		await settle(5);
		expect(result.find('#lazy').textContent).toContain('uninitialized');
		expect(result.find('#mutation').textContent).toContain('uninitialized');
		await unmountAndSettle(result);
	});

	it('supports infinite-query pagination', async () => {
		const result = mount(InfiniteApp, {});
		await settle();
		expect(result.find('#pages').textContent).toBe('pages=page-0:fulfilled');

		result.find('#next').dispatchEvent(new MouseEvent('click', { bubbles: true }));
		await settle();
		expect(result.find('#pages').textContent).toBe('pages=page-0|page-1:fulfilled');
		await unmountAndSettle(result);
	});

	it('supports skip, skipToken, query-state-only, and prefetch hooks', async () => {
		const result = mount(SkipPrefetchApp, {});
		await settle(5);
		expect(result.find('#conditional').textContent).toBe('conditional=-:uninitialized');
		expect(result.find('#skip-token').textContent).toBe('token=uninitialized');
		expect(result.find('#prefetched').textContent).toBe('prefetched=-:uninitialized');

		result.find('#start-conditional').dispatchEvent(new MouseEvent('click', { bubbles: true }));
		result.find('#prefetch-value').dispatchEvent(new MouseEvent('click', { bubbles: true }));
		await settle();
		expect(result.find('#conditional').textContent).toBe('conditional=value-conditional:fulfilled');
		expect(result.find('#skip-token').textContent).toBe('token=uninitialized');
		expect(result.find('#prefetched').textContent).toBe('prefetched=value-prefetched:fulfilled');
		await unmountAndSettle(result);
	});

	it('supports reactHooksModule and ApiProvider with a custom Redux context', async () => {
		const result = mount(CustomContextApp, {});
		expect(result.find('#custom-context').textContent).toContain('pending');
		await settle();
		expect(result.find('#custom-context').textContent).toBe('custom=custom-value:fulfilled');
		await unmountAndSettle(result);
	});

	it('rejects ApiProvider nesting inside an existing Redux context', () => {
		expect(() => mount(NestedApiProviderApp, {})).toThrow(/Existing Redux context detected/);
	});
});
