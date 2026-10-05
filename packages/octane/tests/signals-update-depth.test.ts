import { describe, expect, it, vi } from 'vitest';
import { createRoot, flushSync } from '../src/index.js';
import { act, mount } from './_helpers.js';
import {
	CapturedObjectChain,
	CapturedQueryChain,
	StalePendingChain,
	SwitchedPendingChain,
} from './_fixtures/signals-update-depth.tsrx';

// A render loop driven by microtasks starves the timers Vitest's timeout needs.
// The bound turns such a livelock into a failure instead of a hung run.
function renderBound(): () => void {
	let renders = 0;
	return () => {
		if (++renders > 200) throw new Error('the component kept rendering without settling');
	};
}

function settle(): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, 0));
}

// A pending read throws a promise that settles once the value may have changed.
// One that has already settled while the value is still pending would retry its
// reader, such as an async derived$ awaiting it, without end.
async function settledAlready(waiting: unknown): Promise<boolean> {
	expect(waiting).toBeInstanceOf(Promise);
	return Promise.race([(waiting as Promise<unknown>).then(() => true), settle().then(() => false)]);
}

function deferredLoads() {
	const pending = new Map<string, (value: string) => void>();
	const load = vi.fn(
		(key: string) =>
			new Promise<string>((done) => {
				pending.set(key, done);
			}),
	);
	return { load, resolve: (key: string, value: string) => pending.get(key)!(value) };
}

function setup() {
	const container = document.createElement('div');
	document.body.appendChild(container);
	const errors: unknown[] = [];
	const root = createRoot(container, { onUncaughtError: (error) => errors.push(error) });
	return {
		container,
		errors,
		root,
		click(selector: string) {
			flushSync(() => (container.querySelector(selector) as HTMLElement).click());
		},
		text(selector: string) {
			return container.querySelector(selector)?.textContent;
		},
		dispose() {
			root.unmount();
			container.remove();
		},
	};
}

// Accepting a render can publish a changed signal to the component that
// rendered it. Each such render belongs to the update that started the cycle,
// so a cycle that never settles spends that update's nested-update budget.
describe('signal-driven render loops', () => {
	it('reports a loop through its own redeclared derived$ as an update depth error', async () => {
		const view = setup();
		try {
			flushSync(() => view.root.render(CapturedObjectChain, { onRender: renderBound() }));
			expect(view.text('output')).toBe('0:1');
			view.click('#tick');
			await settle();
			expect(view.errors).toHaveLength(1);
			const message = String(view.errors[0]);
			expect(message).toContain('Maximum update depth exceeded');
			expect(message).toMatch(
				/Signals read by CapturedObjectChain( \([^)]+\))? changed every time its render was accepted/,
			);
			// No boundary handled it, so the root unmounted rather than freezing.
			expect(view.container.innerHTML).toBe('');
		} finally {
			view.dispose();
		}
	});

	it('rejects act() with the update depth error', async () => {
		const root = mount(CapturedObjectChain, { onRender: renderBound() });
		try {
			await expect(act(() => root.click('#tick'))).rejects.toThrow('Maximum update depth exceeded');
		} finally {
			root.unmount();
		}
	});

	it('stops the loop in production too', async () => {
		vi.stubEnv('NODE_ENV', 'production');
		const view = setup();
		try {
			flushSync(() => view.root.render(CapturedObjectChain, { onRender: renderBound() }));
			view.click('#tick');
			await settle();
			expect(view.errors).toHaveLength(1);
			expect(String(view.errors[0])).toContain('Minified Octane error #1');
			expect(view.container.innerHTML).toBe('');
		} finally {
			view.dispose();
			vi.unstubAllEnvs();
		}
	});
});

// A redeclared definition that presents the committed result again, the same
// pending read or the same error, changes nothing its readers can observe.
describe('redeclared signals with an unchanged result', () => {
	it('settles while the query it reads is pending', async () => {
		const { load, resolve } = deferredLoads();
		const view = setup();
		try {
			flushSync(() => view.root.render(CapturedQueryChain, { load, onRender: renderBound() }));
			await settle();
			expect(view.text('output')).toBe('0:pending');
			view.click('#tick');
			await settle();
			expect(view.errors).toEqual([]);
			expect(view.text('output')).toBe('1:pending');
			resolve('source', 'value');
			await settle();
			expect(view.text('output')).toBe('1:value!');
			expect(load).toHaveBeenCalledOnce();
		} finally {
			view.dispose();
		}
	});

	it('settles after the query it reads is rejected', async () => {
		const load = vi.fn((_key: string) => Promise.reject(new Error('failed')));
		const view = setup();
		try {
			flushSync(() => view.root.render(CapturedQueryChain, { load, onRender: renderBound() }));
			await settle();
			expect(view.text('output')).toBe('0:error');
			view.click('#tick');
			await settle();
			expect(view.errors).toEqual([]);
			expect(view.text('output')).toBe('1:error');
			expect(load).toHaveBeenCalledOnce();
		} finally {
			view.dispose();
		}
	});

	it('waits on the query a redeclared definition reads, not the one it replaced', async () => {
		const { load, resolve } = deferredLoads();
		let waiting: unknown;
		const onWait = (thrown: unknown) => {
			waiting = thrown;
		};
		const view = setup();
		try {
			flushSync(() =>
				view.root.render(SwitchedPendingChain, { select: { key: 'a' }, load, onWait }),
			);
			await settle();
			flushSync(() =>
				view.root.render(SwitchedPendingChain, { select: { key: 'b' }, load, onWait }),
			);
			await settle();
			// The replaced definition's query settles first.
			resolve('a', 'A');
			await settle();
			expect(view.text('#a')).toBe('ready');
			expect(view.text('#value')).toBe('pending');
			view.click('#read');
			expect(await settledAlready(waiting)).toBe(false);
			resolve('b', 'B');
			await settle();
			expect(view.errors).toEqual([]);
			expect(view.text('#value')).toBe('B!');
			expect(load.mock.calls.map(([key]) => key)).toEqual(['a', 'b']);
		} finally {
			view.dispose();
		}
	});

	it('waits on the current read when the committed definition is out of date', async () => {
		const { load, resolve } = deferredLoads();
		let waiting: unknown;
		const onWait = (thrown: unknown) => {
			waiting = thrown;
		};
		const view = setup();
		try {
			flushSync(() => view.root.render(StalePendingChain, { load, onWait }));
			await settle();
			// The write invalidates the committed definition, and the render it
			// causes redeclares that definition before anything reads the cell.
			view.click('#count');
			await settle();
			expect(view.text('#count')).toBe('2');
			expect(view.text('#value')).toBe('pending');
			view.click('#read');
			expect(await settledAlready(waiting)).toBe(false);
			resolve('source', 'value');
			await settle();
			expect(view.errors).toEqual([]);
			expect(view.text('#value')).toBe('2value!');
			expect(load).toHaveBeenCalledOnce();
		} finally {
			view.dispose();
		}
	});
});
