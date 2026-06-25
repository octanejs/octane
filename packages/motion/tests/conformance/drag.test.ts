import { describe, it, expect, vi } from 'vitest';
import { mount, nextPaint } from '../_helpers';
import { DragBox } from '../_fixtures/drag.tsrx';

function pointer(type: string, target: EventTarget, clientX: number, clientY: number) {
	const e = new MouseEvent(type, { bubbles: true, clientX, clientY });
	target.dispatchEvent(e);
}

describe('drag', () => {
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
