import { act, startTransition } from 'octane';
import { describe, it, expect, vi } from 'vitest';
import { mount, nextPaint } from '../_helpers';
import { DragBox, SuspendedDrag } from '../_fixtures/drag.tsrx';

function pointer(type: string, target: EventTarget, clientX: number, clientY: number) {
	const e = new MouseEvent(type, { bubbles: true, clientX, clientY });
	target.dispatchEvent(e);
}

describe('drag', () => {
	it('disables new pointer drags without canceling an active one', () => {
		const onDragStart = vi.fn();
		const onDrag = vi.fn();
		const onDragEnd = vi.fn();
		const callbacks = { onDragStart, onDrag, onDragEnd };
		const r = mount(DragBox, { ...callbacks, dragListener: false });
		try {
			const div = r.find('#box');
			pointer('pointerdown', div, 0, 0);
			pointer('pointermove', window, 15, 10);
			pointer('pointerup', window, 15, 10);
			expect(onDragStart).not.toHaveBeenCalled();
			expect(onDrag).not.toHaveBeenCalled();
			expect(onDragEnd).not.toHaveBeenCalled();

			r.update(DragBox, { ...callbacks, dragListener: true });
			pointer('pointerdown', div, 0, 0);
			pointer('pointermove', window, 15, 10);
			expect(div.style.transform).toBe('translateX(15px) translateY(10px)');

			r.update(DragBox, { ...callbacks, dragListener: false });
			pointer('pointermove', window, 25, 20);
			pointer('pointerup', window, 25, 20);
			expect(div.style.transform).toBe('translateX(25px) translateY(20px)');
			expect(onDragStart).toHaveBeenCalledTimes(1);
			expect(onDragEnd).toHaveBeenCalledTimes(1);

			pointer('pointerdown', div, 0, 0);
			pointer('pointermove', window, 5, 5);
			pointer('pointerup', window, 5, 5);
			expect(div.style.transform).toBe('translateX(25px) translateY(20px)');
			expect(onDragStart).toHaveBeenCalledTimes(1);
			expect(onDragEnd).toHaveBeenCalledTimes(1);
		} finally {
			r.unmount();
		}
	});

	it('keeps the committed pointer setting while a descendant suspends', async () => {
		const onDragStart = vi.fn();
		const onPending = vi.fn(() => {
			pointer('pointerdown', div, 0, 0);
			pointer('pointerup', window, 0, 0);
		});
		const r = mount(SuspendedDrag, { dragListener: false, onDragStart, onPending });
		const div = r.find('#box');
		const { promise, resolve } = Promise.withResolvers<void>();
		try {
			await act(() =>
				startTransition(() =>
					r.root.render(SuspendedDrag, {
						dragListener: true,
						onDragStart,
						onPending,
						wait: promise,
					}),
				),
			);
			expect(onPending).toHaveBeenCalled();
			expect(onDragStart).not.toHaveBeenCalled();
			expect(r.find('#box')).toBe(div);

			await act(async () => resolve());
			expect(div.textContent).toBe('ready');
			pointer('pointerdown', div, 0, 0);
			pointer('pointerup', window, 0, 0);
			expect(onDragStart).toHaveBeenCalledTimes(1);
		} finally {
			r.unmount();
		}
	});

	it('keeps drag controls out of the client host attributes', () => {
		const r = mount(DragBox, { dragListener: false, dragControls: {} });
		try {
			const div = r.find('#box');
			expect(div.hasAttribute('dragListener')).toBe(false);
			expect(div.hasAttribute('dragControls')).toBe(false);
		} finally {
			r.unmount();
		}
	});

	it('drags the element by the pointer offset, clamped to dragConstraints', async () => {
		const onDrag = vi.fn();
		const r = mount(DragBox, { onDrag });
		await nextPaint();
		const div = r.find('#box');

		pointer('pointerdown', div, 0, 0);
		pointer('pointermove', window, 30, 10);
		expect(div.style.transform).toBe('translateX(30px) translateY(10px)');
		expect(onDrag).toHaveBeenCalled();

		// Past the constraint (right: 50) → clamped.
		pointer('pointermove', window, 200, 0);
		expect(div.style.transform).toBe('translateX(50px) translateY(0px)');
		pointer('pointerup', window, 200, 0);
		r.unmount();
	});
});
