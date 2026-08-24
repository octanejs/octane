import { afterEach, describe, expect, it, vi } from 'vitest';

import { act, mount, nextPaint } from '../../octane/tests/_helpers';
import {
	ActivatingDropTarget,
	ActivityDraggable,
	NativeDraggable,
} from './_fixtures/dnd-native-lifecycle.tsx';

function pointerEvent(type: string, init: PointerEventInit = {}): PointerEvent {
	return new PointerEvent(type, {
		bubbles: true,
		cancelable: true,
		button: 0,
		pointerId: 1,
		pointerType: 'mouse',
		width: 20,
		height: 20,
		pressure: 0.5,
		detail: 1,
		...init,
	});
}

const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

function dragEvent(type: string, x: number, y: number): Event {
	const event = new Event(type, { bubbles: true, cancelable: true });
	Object.defineProperties(event, {
		clientX: { value: x },
		clientY: { value: y },
		dataTransfer: {
			value: {
				dropEffect: 'none',
				effectAllowed: 'all',
				items: [],
			},
		},
	});
	return event;
}

afterEach(() => {
	vi.useRealTimers();
});

describe('@octanejs/aria — native drag and drop lifecycle', () => {
	it('accepts native pointer and click events on a draggable without a drag button', async () => {
		const onDragStart = vi.fn();
		const r = mount(NativeDraggable, { onDragStart });
		const draggable = r.find('button') as HTMLElement;

		await act(() => {
			draggable.dispatchEvent(
				pointerEvent('pointerdown', { width: 0, height: 0, pressure: 0, detail: 0 }),
			);
			draggable.dispatchEvent(
				new MouseEvent('click', { bubbles: true, cancelable: true, detail: 1 }),
			);
		});

		expect(onDragStart).toHaveBeenCalledTimes(1);
		expect(draggable.getAttribute('data-dragging')).toBe('true');

		await act(async () => {
			await nextFrame();
			document.dispatchEvent(
				new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
			);
		});
		expect(draggable.getAttribute('data-dragging')).toBe('false');
		r.unmount();
	});

	it('does not activate a hovered drop target after it unmounts', async () => {
		vi.useFakeTimers();
		const onDropActivate = vi.fn();
		const r = mount(ActivatingDropTarget, { onDropActivate });
		const target = r.find('div');

		await act(() => {
			target.dispatchEvent(dragEvent('dragenter', 10, 10));
			target.dispatchEvent(dragEvent('dragover', 12, 12));
		});
		expect(target.getAttribute('data-drop-target')).toBe('true');
		r.unmount();

		await act(() => vi.advanceTimersByTime(800));
		expect(onDropActivate).not.toHaveBeenCalled();
	});

	it('does not end a drag when Activity hides a still-connected draggable', async () => {
		const onDragStart = vi.fn();
		const onDragEnd = vi.fn();
		const r = mount(ActivityDraggable, { mode: 'visible', onDragStart, onDragEnd });
		await act(() => nextPaint());
		const draggable = r.find('button') as HTMLElement;

		await act(() => {
			draggable.dispatchEvent(
				pointerEvent('pointerdown', { width: 0, height: 0, pressure: 0, detail: 0 }),
			);
			draggable.dispatchEvent(
				new MouseEvent('click', { bubbles: true, cancelable: true, detail: 1 }),
			);
		});
		expect(onDragStart).toHaveBeenCalledTimes(1);
		expect(draggable.getAttribute('data-dragging')).toBe('true');
		await act(async () => {
			await nextFrame();
		});

		r.update(ActivityDraggable, { mode: 'hidden', onDragStart, onDragEnd });
		await act(() => nextPaint());
		expect(draggable.isConnected).toBe(true);
		expect(onDragEnd).not.toHaveBeenCalled();

		r.update(ActivityDraggable, { mode: 'visible', onDragStart, onDragEnd });
		await act(async () => {
			await nextPaint();
			document.dispatchEvent(
				new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
			);
		});
		expect(onDragEnd).toHaveBeenCalledTimes(1);
		r.unmount();
	});
});
