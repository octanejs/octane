import { describe, expect, it } from 'vitest';
import { act, mount } from './_helpers';
import { OffsetReader, OffsetReaderKeyed } from './_fixtures/data-callback-hooks.tsrx';
import { loadCompiledFixtureSource } from './_server-fixture';

// Dep-keying a callback changes when its identity moves, never what it computes.
// These run in BOTH vitest projects, so the dev compile (which never keys) and
// the production compile must agree on every assertion.

function makeStore(base: number) {
	let value = { base };
	const listeners = new Set<() => void>();
	return {
		get: () => value,
		set: (b: number) => {
			value = { base: b };
			for (const l of listeners) l();
		},
		subscribe: (l: () => void) => {
			listeners.add(l);
			return () => listeners.delete(l);
		},
	};
}

describe.each([
	['authored form', OffsetReader],
	['dep-keyed form', OffsetReaderKeyed],
])('dep-keyed callbacks preserve semantics (%s)', (_label, Component) => {
	it('tracks the store, the captured prop, and unrelated state independently', async () => {
		const store = makeStore(10);
		let setTick!: (n: number) => void;
		const r = mount(Component, { store, offset: 1, bind: (fn: any) => (setTick = fn) });
		await act(() => {});
		expect(r.find('#total').textContent).toBe('11');

		// Unrelated local state moves; the selection must not go stale or change.
		await act(() => setTick(1));
		expect(r.find('#tick').textContent).toBe('1');
		expect(r.find('#total').textContent).toBe('11');

		// The store moves.
		await act(() => store.set(20));
		expect(r.find('#total').textContent).toBe('21');

		// The CAPTURED prop moves — the whole point of keying on captures rather
		// than on the callback's identity.
		await act(() => r.update(Component, { store, offset: 5, bind: (fn: any) => (setTick = fn) }));
		expect(r.find('#total').textContent).toBe('25');

		// And the store still moves after the prop change.
		await act(() => store.set(30));
		expect(r.find('#total').textContent).toBe('35');
		r.unmount();
	});
});

describe.each([false, true])('declared data callbacks (inline=%s)', (inlineHookMemo) => {
	it('preserves a selection while its source and captured member stay equal', () => {
		const { App } = loadCompiledFixtureSource(
			`import { useMemo } from 'octane';
			function useLocalSelector(source, selector) {
				return useMemo(() => selector(source), [source, selector]);
			}
			export function App(props) @{
				const selected = useLocalSelector(props.source, (s) => ({ total: s.base + props.offset }));
				props.observe(selected);
				<p>{String(selected.total)}</p>
			}`,
			{
				id: 'declared-data-callback.tsrx',
				mode: 'client',
				compileOptions: {
					hmr: false,
					dev: false,
					inlineHookMemo,
					dataCallbackHooks: ['useLocalSelector'],
				},
			},
		);
		let selected!: { total: number };
		const observe = (value: { total: number }) => {
			selected = value;
		};
		const firstSource = { base: 10 };
		const root = mount(App, { source: firstSource, offset: 1, tick: 0, observe });
		const first = selected;
		expect(root.html()).toBe('<p>11</p>');

		root.update(App, { source: firstSource, offset: 1, tick: 1, observe });
		expect(selected).toBe(first);
		expect(root.html()).toBe('<p>11</p>');

		const secondSource = { base: 20 };
		root.update(App, { source: secondSource, offset: 1, tick: 1, observe });
		const second = selected;
		expect(second).not.toBe(first);
		expect(root.html()).toBe('<p>21</p>');

		root.update(App, { source: secondSource, offset: 5, tick: 1, observe });
		const third = selected;
		expect(third).not.toBe(second);
		expect(root.html()).toBe('<p>25</p>');
		root.update(App, { source: secondSource, offset: 5, tick: 2, observe });
		expect(selected).toBe(third);
		root.unmount();
	});
});
