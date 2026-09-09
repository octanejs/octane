import { describe, it, expect } from 'vitest';
import { prerender } from 'octane/static';
import { flushSync, hydrateRoot } from '../src/index.js';
import { mount, act } from './_helpers';
import { loadServerFixture } from './_server-fixture';
import {
	DynamicProvider,
	CombinedDynamic,
	BareReader,
	RemountingProvider,
	Siblings,
	TwoContexts,
	ConditionalUse,
	ListConsumers,
	PortalledContext,
	LiveCount,
	StableChildren,
	ContextOnlyHost,
	MixedContextPromiseHost,
	ContextOnlyAsyncHost,
	ShadowedContextPromiseHost,
} from './_fixtures/context.tsrx';

describe('context — value updates', () => {
	it('consumers re-render when Provider value changes', () => {
		const r = mount(DynamicProvider);
		expect(r.find('.theme').textContent).toBe('init');
		r.click('#swap');
		expect(r.find('.theme').textContent).toBe('changed');
		r.click('#swap');
		expect(r.find('.theme').textContent).toBe('init');
		r.unmount();
	});

	it('consumers below an identity-stable {children} passthrough see the new value', () => {
		// The Provider re-renders with a new value while its `{props.children}`
		// hole receives the SAME children block each pass — the compiled hole
		// must still hand the unchanged renderable to childSlot so the consumer
		// below refreshes (an inline identity skip strands it on the old value).
		const r = mount(StableChildren);
		expect(r.find('.theme').textContent).toBe('init');
		r.click('#swap');
		expect(r.find('.theme').textContent).toBe('changed');
		r.click('#swap');
		expect(r.find('.theme').textContent).toBe('init');
		r.unmount();
	});
});

describe('context — multiple consumers', () => {
	it('all sibling consumers read the same Provider value', () => {
		const r = mount(Siblings);
		expect(r.findAll('.theme').map((el) => el.textContent)).toEqual(['dark', 'dark', 'dark']);
		r.unmount();
	});

	it('distinct contexts do not leak into each other', () => {
		const r = mount(TwoContexts);
		expect(r.find('.theme').textContent).toBe('dark');
		expect(r.find('.user').textContent).toBe('alice');
		expect(r.find('.combined').textContent).toBe('dark/alice');
		r.unmount();
	});

	it('a consumer of two contexts reads both live after a re-render', () => {
		// Multi-entry resolved-provider cache: re-rendering with one Provider
		// changed must yield the new value for that context AND the unchanged
		// value for the other.
		const r = mount(CombinedDynamic);
		expect(r.find('.combined').textContent).toBe('t0/alice');
		r.click('#bump');
		expect(r.find('.combined').textContent).toBe('t1/alice');
		r.click('#bump');
		expect(r.find('.combined').textContent).toBe('t0/alice');
		r.unmount();
	});
});

describe('context — provider remount', () => {
	it('a consumer reads the fresh value when its Provider is torn down and rebuilt', () => {
		// The Provider's scope is destroyed on `show: false` and a brand-new one
		// (with a different value) is built on the next `show: true`. The consumer
		// must read the current value each time — never one cached from a prior
		// mount. Guards the invariant the cache relies on after dropping its
		// defensive resolver recheck.
		const r = mount(RemountingProvider, { show: true, value: 1 });
		expect(r.find('.count').textContent).toBe('1');
		r.update(RemountingProvider, { show: false, value: 1 });
		expect(r.find('.off').textContent).toBe('off');
		r.update(RemountingProvider, { show: true, value: 2 });
		expect(r.find('.count').textContent).toBe('2');
		r.update(RemountingProvider, { show: false, value: 2 });
		r.update(RemountingProvider, { show: true, value: 3 });
		expect(r.find('.count').textContent).toBe('3');
		r.unmount();
	});
});

describe('context — no Provider (default)', () => {
	it('a provider-less consumer keeps reading the default across re-renders', () => {
		// Exercises the resolved-provider cache's "cached default" path: the first
		// read records "no provider", and re-renders must keep returning the
		// context default rather than a stale or wrong value.
		const r = mount(BareReader, { tick: 0 });
		expect(r.find('.bare').textContent).toBe('0:0');
		r.update(BareReader, { tick: 1 });
		expect(r.find('.bare').textContent).toBe('0:1');
		r.update(BareReader, { tick: 2 });
		expect(r.find('.bare').textContent).toBe('0:2');
		r.unmount();
	});
});

describe('context — inside control flow', () => {
	it('use() inside an if-branch reads the active Provider', () => {
		const r = mount(ConditionalUse, { show: true });
		expect(r.find('.theme').textContent).toBe('dark');
		r.update(ConditionalUse, { show: false });
		expect(r.findAll('.theme')).toHaveLength(0);
		expect(r.find('.hidden').textContent).toBe('hidden');
		r.update(ConditionalUse, { show: true });
		expect(r.find('.theme').textContent).toBe('dark');
		r.unmount();
	});

	it('use() inside for-of items reads the active Provider per item', () => {
		const r = mount(ListConsumers, { items: [1, 2, 3], value: 42 });
		expect(r.findAll('.count').map((el) => el.textContent)).toEqual(['42', '42', '42']);
		r.unmount();
	});

	it('Provider value updates flow to all for-of consumers', () => {
		const r = mount(LiveCount, { ids: ['a', 'b', 'c'] });
		expect(r.findAll('.count').map((el) => el.textContent)).toEqual(['0', '0', '0']);
		r.click('#inc');
		expect(r.findAll('.count').map((el) => el.textContent)).toEqual(['1', '1', '1']);
		r.click('#inc');
		r.click('#inc');
		expect(r.findAll('.count').map((el) => el.textContent)).toEqual(['3', '3', '3']);
		r.unmount();
	});
});

describe('context — through portals', () => {
	it('Provider wraps a portal — portal-target consumers see the value', () => {
		const target = document.createElement('aside');
		document.body.appendChild(target);
		const r = mount(PortalledContext, { target });
		// Portal content lives in `target`, NOT in the app container.
		expect(r.findAll('.portal-content')).toHaveLength(0);
		expect(target.querySelector('.portal-content')).not.toBe(null);
		// And the consumer inside the portal sees the outer Provider's value.
		expect(target.querySelector('.theme')!.textContent).toBe('from-portal-parent');
		r.unmount();
		target.remove();
	});
});

describe('context — use() alongside other reads', () => {
	it('direct reads, a custom hook, and a selected context follow provider updates', () => {
		const r = mount(ContextOnlyHost);
		try {
			expect(r.find('.context-only').textContent).toBe('light|alice|light/alice');
			r.click('#change-theme');
			expect(r.find('.context-only').textContent).toBe('dark|alice|dark/alice');
			r.click('#change-selection');
			expect(r.find('.context-only').textContent).toBe('dark|dark|dark/alice');
			r.click('#change-user');
			expect(r.find('.context-only').textContent).toBe('dark|dark|dark/bob');
			r.click('#change-selection');
			expect(r.find('.context-only').textContent).toBe('dark|bob|dark/bob');
		} finally {
			r.unmount();
		}
	});

	it('starts independent descendant data while pending and reads the latest context', async () => {
		const requests: string[] = [];
		const jobs = new Map<string, { promise: Promise<string>; resolve: (value: string) => void }>();
		for (const key of ['first', 'second', 'detail']) {
			let resolve!: (value: string) => void;
			const promise = new Promise<string>((done) => (resolve = done));
			jobs.set(key, { promise, resolve });
		}
		const r = mount(MixedContextPromiseHost, {
			load(key: string) {
				requests.push(key);
				return jobs.get(key)!.promise;
			},
		});
		try {
			// The descendant can begin before its parent has usable data.
			expect(requests).toEqual(['first', 'second', 'detail']);
			expect(r.find('.mixed-context-pending').textContent).toBe('loading');
			r.click('#change-pending-theme');
			await act(() => jobs.get('first')!.resolve('one'));
			expect(r.find('.mixed-context-pending').textContent).toBe('loading');
			await act(() => jobs.get('second')!.resolve('two'));
			expect(r.find('.mixed-context-pending').textContent).toBe('loading');
			await act(() => jobs.get('detail')!.resolve('more'));
			expect(r.find('.mixed-context-promise').textContent).toBe('light:one/two');
			expect(r.find('.mixed-context-detail').textContent).toBe('more');
			r.click('#change-pending-theme');
			expect(r.find('.mixed-context-promise').textContent).toBe('dark:one/two');
		} finally {
			r.unmount();
		}
	});

	it('starts an independent sibling request while a context-only parent is pending', async () => {
		let resolveFirst!: (value: string) => void;
		let resolveSecond!: (value: string) => void;
		const first = new Promise<string>((resolve) => (resolveFirst = resolve));
		const second = new Promise<string>((resolve) => (resolveSecond = resolve));
		const requests: string[] = [];
		const r = mount(ContextOnlyAsyncHost, {
			load(key: string) {
				requests.push(key);
				return key === 'first' ? first : second;
			},
		});
		try {
			expect(r.find('.context-async-pending').textContent).toBe('loading');
			// Both child requests begin in the first attempt, before either settles.
			expect(requests).toEqual(['first', 'second']);
			await act(() => {
				resolveFirst('one');
				resolveSecond('two');
			});
			expect(r.find('.context-async-siblings').getAttribute('data-theme')).toBe('dark');
			expect(r.find('.context-async-first').textContent).toBe('one');
			expect(r.find('.context-async-second').textContent).toBe('two');
		} finally {
			r.unmount();
		}
	});

	it('keeps a locally shadowed context name pending and starts its independent child', async () => {
		let resolveGate!: (value: string) => void;
		let resolveDetail!: (value: string) => void;
		const gate = new Promise<string>((resolve) => (resolveGate = resolve));
		const detail = new Promise<string>((resolve) => (resolveDetail = resolve));
		let detailStarted = false;
		const r = mount(ShadowedContextPromiseHost, {
			gate,
			load() {
				detailStarted = true;
				return detail;
			},
		});
		try {
			expect(r.find('.shadowed-context-pending').textContent).toBe('loading');
			expect(detailStarted).toBe(true);
			await act(() => resolveGate('ready'));
			expect(r.find('.shadowed-context-pending').textContent).toBe('loading');
			await act(() => resolveDetail('more'));
			expect(r.find('.shadowed-context-result').textContent).toBe('dark:ready');
			expect(r.find('.shadowed-context-detail').textContent).toBe('more');
		} finally {
			r.unmount();
		}
	});

	it('hydrates context-only reads and keeps provider updates live', async () => {
		const server = loadServerFixture('packages/octane/tests/_fixtures/context.tsrx');
		const { html } = await prerender(server.ContextOnlyHost, {});
		const container = document.createElement('div');
		container.innerHTML = html;
		document.body.appendChild(container);
		const output = container.querySelector('.context-only')!;
		let root: ReturnType<typeof hydrateRoot> | undefined;
		try {
			expect(output.textContent).toBe('light|alice|light/alice');
			root = hydrateRoot(container, ContextOnlyHost);
			flushSync(() => {});
			expect(container.querySelector('.context-only')).toBe(output);
			flushSync(() => (container.querySelector('#change-theme') as HTMLElement).click());
			expect(output.textContent).toBe('dark|alice|dark/alice');
		} finally {
			root?.unmount();
			container.remove();
		}
	});
});
