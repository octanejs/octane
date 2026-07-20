import { describe, expect, it } from 'vitest';
import { act, mount } from './_helpers';
import {
	BranchChainHost,
	ChainHost,
	PropChainHost,
	SetupShadowHost,
	ShadowedLoopHost,
	SwitchingChainHost,
} from './_fixtures/use-chain-memo.tsrx';

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

	it('memoizes a chain const declared in an else-if arm (fetches once across the replay)', async () => {
		const calls: string[] = [];
		let release: (() => void) | null = null;
		const fetchUser = (id: string) => {
			calls.push(id);
			return new Promise<string>((resolve) => {
				release = () => resolve('U' + id);
			});
		};
		const r = mount(BranchChainHost, { fetchUser, mode: 'b', id: 'x' });
		expect(r.html()).toContain('loading');
		expect(calls).toEqual(['x']);
		await act(() => release!());
		expect(r.html()).toContain('label=Ux');
		// The replay re-entered the else-if arm; its memoized creation must hit.
		expect(calls).toEqual(['x']);
		r.unmount();
	});

	it('a setup-block shadow does not freeze the outer same-named const', () => {
		let n = 0;
		const build = () => ({ n: ++n });
		const fetchThing = (id: string) =>
			({ then: () => {}, status: 'fulfilled', value: 'V' + id }) as unknown as Promise<string>;
		const log: string[] = [];
		const r = mount(SetupShadowHost, {
			log: (entry: string) => log.push(entry),
			build,
			fetchThing,
			id: 'a',
		});
		expect(r.html()).toContain('l=t0:Va');
		expect(log).toEqual(['built:1']);
		r.click('#tick');
		// The outer `const item = build()` must keep recreating per render —
		// the inner shadowed use() binding cannot taint it into memoization.
		expect(log).toEqual(['built:1', 'built:2']);
		expect(r.html()).toContain('l=t1:Va');
		r.unmount();
	});

	it('a shadowing @for item binding does not taint a same-named body const', () => {
		// use(item.promise) inside the @for arm refers to the ARM's `item`; the
		// unrelated body const `item = build()` must keep recreating per render
		// (memoizing it would freeze `built:` at 1).
		let n = 0;
		const build = () => ({ n: ++n });
		const fulfilled = (value: string): Promise<string> =>
			({ then: () => {}, status: 'fulfilled', value }) as unknown as Promise<string>;
		const log: string[] = [];
		const r = mount(ShadowedLoopHost, {
			log: (entry: string) => log.push(entry),
			build,
			rows: [{ id: 1, promise: fulfilled('X') }],
		});
		expect(r.html()).toContain('v=X');
		expect(log).toEqual(['built:1']);
		r.click('#tick');
		expect(log).toEqual(['built:1', 'built:2']);
		expect(r.html()).toContain('t=1');
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
