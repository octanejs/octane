import { describe, expect, it } from 'vitest';
import { act, mount } from './_helpers';
import { ChainHost, PropChainHost, SwitchingChainHost } from './_fixtures/use-chain-memo.tsrx';

// Pass A′ (use()-fed const chain memoization) behavioral contract. Runs under
// both vitest projects: `octane` exercises the runtime `_$useMemo` form,
// `octane-prod` the closure-free puTake/puPub lowering.

function makeFetcher() {
	const calls: string[] = [];
	let release: (() => void) | null = null;
	const fetchUser = (id: string) => {
		calls.push(id);
		return new Promise<{ thumb: string }>((resolve) => {
			release = () => resolve({ thumb: 'T' + id });
		});
	};
	return {
		calls,
		fetchUser,
		release: () => release!(),
	};
}

describe('use()-fed const chain memoization', () => {
	it('fetches once across the suspend replay (no duplicate request)', async () => {
		const f = makeFetcher();
		const r = mount(ChainHost, { fetchUser: f.fetchUser, id: 'a' });
		expect(r.html()).toContain('loading');
		expect(f.calls).toEqual(['a']);
		await act(() => f.release());
		expect(r.html()).toContain('thumb=Ta');
		// The replay re-ran the body; the memoized chain must NOT refetch.
		expect(f.calls).toEqual(['a']);
		r.unmount();
	});

	it('does not refetch on an unrelated parent re-render', async () => {
		const f = makeFetcher();
		const r = mount(ChainHost, { fetchUser: f.fetchUser, id: 'a' });
		await act(() => f.release());
		expect(r.html()).toContain('thumb=Ta');
		r.click('#tick');
		expect(r.html()).toContain('tick=1');
		expect(r.html()).toContain('thumb=Ta');
		expect(f.calls).toEqual(['a']);
		r.unmount();
	});

	it('the originating shape — chain consts feeding a component-prop use() — fetches once and thumbnails once', async () => {
		const userCalls: string[] = [];
		const thumbCalls: string[] = [];
		let releaseUser: (() => void) | null = null;
		let releaseThumb: (() => void) | null = null;
		const fetchUser = (id: string) => {
			userCalls.push(id);
			return new Promise<{ thumbnail: () => Promise<string> }>((resolve) => {
				releaseUser = () =>
					resolve({
						thumbnail: () => {
							thumbCalls.push(id);
							return new Promise<string>((res) => {
								releaseThumb = () => res('thumb-' + id);
							});
						},
					});
			});
		};
		const r = mount(PropChainHost, { fetchUser, id: 'a' });
		expect(r.html()).toContain('loading');
		expect(userCalls).toEqual(['a']);
		await act(() => releaseUser!());
		// The derived link fired exactly one thumbnail() call, on the replay
		// wave — no duplicate user fetch either.
		expect(userCalls).toEqual(['a']);
		expect(thumbCalls).toEqual(['a']);
		await act(() => releaseThumb!());
		expect(r.html()).toContain('<img src="thumb-a"');
		expect(userCalls).toEqual(['a']);
		expect(thumbCalls).toEqual(['a']);
		r.unmount();
	});

	it('a derived link tracks an unmemoized upstream promise (never staler than recompute)', async () => {
		// `base` is a reassigned let — not memoizable — so the derived `.then`
		// link must key on base's IDENTITY. A member-path dep (`base.then` ===
		// Promise.prototype.then) would pin the first promise forever.
		const resolved =
			(v: string) =>
			(_id: string): Promise<{ v: string }> =>
				Promise.resolve({ v });
		const r = mount(SwitchingChainHost, {
			fetchA: resolved('A'),
			fetchB: resolved('B'),
			useB: false,
			id: 'x',
		});
		await act(() => {});
		expect(r.html()).toContain('v=A');
		await act(() => {
			r.root.render(SwitchingChainHost, {
				fetchA: resolved('A'),
				fetchB: resolved('B'),
				useB: true,
				id: 'x',
			});
		});
		await act(() => {});
		expect(r.html()).toContain('v=B');
		r.unmount();
	});

	it('refetches the whole chain when the input changes', async () => {
		const f = makeFetcher();
		const r = mount(ChainHost, { fetchUser: f.fetchUser, id: 'a' });
		await act(() => f.release());
		expect(r.html()).toContain('thumb=Ta');
		await act(() => {
			r.root.render(ChainHost, { fetchUser: f.fetchUser, id: 'b' });
		});
		expect(f.calls).toEqual(['a', 'b']);
		await act(() => f.release());
		expect(r.html()).toContain('thumb=Tb');
		r.unmount();
	});
});
