import { describe, it, expect, vi } from 'vitest';
import { mount, nextPaint } from '../_helpers';
import { MVEBox } from '../_fixtures/mve.tsrx';
import { CrossTree } from '../_fixtures/cross-tree.tsrx';

describe('useMotionValueEvent', () => {
	it('invokes the callback on change and unsubscribes on unmount', async () => {
		const onEvent = vi.fn();
		let x: any;
		const r = mount(MVEBox, { onEvent, onReady: (mv: any) => (x = mv) });
		await nextPaint(); // effect runs → subscription attached
		x.set(7);
		expect(onEvent).toHaveBeenLastCalledWith(7);
		x.set(8);
		expect(onEvent).toHaveBeenLastCalledWith(8);

		r.unmount();
		onEvent.mockClear();
		x.set(99);
		expect(onEvent).not.toHaveBeenCalled(); // unsubscribed
	});

	it('re-subscribes when the callback changes, without leaking the old listener', async () => {
		const a = vi.fn();
		let x: any;
		const r = mount(MVEBox, { onEvent: a, onReady: (mv: any) => (x = mv) });
		await nextPaint();
		const b = vi.fn();
		r.update(MVEBox, { onEvent: b, onReady: (mv: any) => (x = mv) });
		await nextPaint();
		x.set(5);
		expect(b).toHaveBeenLastCalledWith(5);
		expect(a).not.toHaveBeenCalled(); // old listener replaced — no leak
		r.unmount();
	});

	it('catches a change a descendant makes in its own effect (insertion-phase subscribe)', async () => {
		// The parent subscribes; a child lower in the tree sets the value inside its
		// own effect. octane passive effects run child-first, so a passive subscription
		// would miss this — an insertion-phase one (like Framer) does not.
		const onEvent = vi.fn();
		const r = mount(CrossTree, { onEvent });
		await nextPaint();
		expect(onEvent).toHaveBeenCalledWith(123);
		r.unmount();
	});
});
