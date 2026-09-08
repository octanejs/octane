import { describe, it, expect } from 'vitest';
import { mount, act } from './_helpers';
import { createRoot, flushSync } from '../src/index.js';
import {
	SetterRefSwap,
	LoggedRefSwap,
	InlineSetterRef,
	RefStateCausalLoop,
} from './_fixtures/compiled-ref-detach.tsrx';

// Regression: compiled `ref` binding unmount cleanups (and spread/hostComponent/
// fragment-ref ones) detach at COMMIT via queueRefDetach, before that commit's
// attaches — React's mutation→layout phasing. Previously they fired attachRef
// synchronously inside unmountScope (mid-render); a state setter used as a ref
// then saw its null-update render before the replacement element's attach, and
// a fixture like SetterRefSwap flip-flopped between its arms forever.
describe('compiled ref teardown detaches at commit', () => {
	it('a state-setter ref on an element rebuilt by its own state converges', async () => {
		const observed: any[] = [];
		const m = mount(SetterRefSwap as any, { observe: (t: any) => observed.push(t) });
		// Let the attach → re-render → swap cascade settle through the async scheduler.
		await act(async () => {});
		flushSync(() => {});

		// Settled on the truthy arm; the torn-down arm is gone.
		expect(m.container.querySelector('#a')).not.toBeNull();
		expect(m.container.querySelector('#b')).toBeNull();

		// Render 1 saw null (arm b mounts, setter attaches at commit); render 2 saw
		// arm b's element (swap: b unmounts queuing the null detach, a mounts
		// queuing its attach — BOTH land in that commit, so the follow-up render
		// sees arm a's element, never an intermediate null). No further renders.
		expect(observed.length).toBe(3);
		expect(observed[0]).toBe(null);
		expect((observed[1] as Element).id).toBe('b');
		expect((observed[2] as Element).id).toBe('a');
		m.unmount();
	});

	it('a callback ref shared by both arms cycles old → null → new in one commit', () => {
		const calls: (Element | null)[] = [];
		const log = (el: Element | null) => calls.push(el);
		const m = mount(LoggedRefSwap as any, { on: false, log });
		expect(calls.length).toBe(1);
		expect((calls[0] as Element).id).toBe('pb');

		m.root.render(LoggedRefSwap as any, { on: true, log });
		flushSync(() => {});
		expect(calls.length).toBe(3);
		expect(calls[1]).toBe(null); // detach of pb drains before pa's attach
		expect((calls[2] as Element).id).toBe('pa');
		m.unmount();
	});

	it('an object ref shared by both arms ends attached to the new element after a swap', () => {
		const r: { current: Element | null } = { current: null };
		const m = mount(LoggedRefSwap as any, { on: false, log: r });
		expect(r.current!.id).toBe('pb');

		m.root.render(LoggedRefSwap as any, { on: true, log: r });
		flushSync(() => {});
		// The teardown detach must not win over the replacement's attach.
		expect(r.current).not.toBeNull();
		expect(r.current!.id).toBe('pa');
		m.unmount();
	});
});

describe('inline state setter refs', () => {
	it('settles when a changed ref clears and restores the same node in one commit', async () => {
		const view = mount(InlineSetterRef, {});
		try {
			await act(async () => {});
			const button = view.container.querySelector('button')!;
			expect(view.container.querySelector('output')?.textContent).toBe('first:0:attached');
			view.click('button');
			expect(view.container.querySelector('output')?.textContent).toBe('first:1:attached');
			view.root.render(InlineSetterRef, { label: 'second' });
			await act(async () => {});
			expect(view.container.querySelector('button')).toBe(button);
			expect(view.container.querySelector('output')?.textContent).toBe('second:1:attached');
		} finally {
			view.unmount();
		}
	});
});

it('retains the nested-update guard for state updates deferred from ref callbacks', async () => {
	const root = createRoot(document.createElement('div'));
	try {
		await expect(act(() => root.render(RefStateCausalLoop))).rejects.toThrow(
			/Maximum update depth exceeded/,
		);
	} finally {
		root.unmount();
	}
});
