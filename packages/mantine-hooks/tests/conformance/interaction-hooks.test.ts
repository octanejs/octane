import { describe, expect, it, vi } from 'vitest';
import { type UseDragState } from '../../src';
import { getInputOnChange } from '../../src/use-input-state/use-input-state';
import { mount, nextPaint } from '../_helpers';
import {
	DragHarness,
	HoverHarness,
	HoverReplacementHarness,
	LongPressHarness,
	OmittedInteractionOptionsHarness,
} from '../_fixtures/interaction-hooks.tsrx';

describe('@octanejs/mantine-hooks interaction hooks', () => {
	it('uses interaction defaults when TSRX omits optional arguments', async () => {
		const onOutside = vi.fn();
		const onHotkey = vi.fn();
		const result = mount(OmittedInteractionOptionsHarness, { onOutside, onHotkey });
		await nextPaint();

		document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
		document.documentElement.dispatchEvent(
			new KeyboardEvent('keydown', { bubbles: true, key: 'k' }),
		);

		expect(onOutside).toHaveBeenCalledOnce();
		expect(onHotkey).toHaveBeenCalledOnce();
		result.unmount();
	});

	it('removes useHover listeners when its ref is cleaned up', () => {
		const removeEventListener = vi.spyOn(HTMLElement.prototype, 'removeEventListener');
		const result = mount(HoverHarness, {});
		const node = result.find('#hover');

		result.unmount();

		expect(removeEventListener).toHaveBeenCalledWith('mouseenter', expect.any(Function));
		expect(removeEventListener).toHaveBeenCalledWith('mouseleave', expect.any(Function));
		expect(removeEventListener.mock.instances).toContain(node);
		removeEventListener.mockRestore();
	});

	it('preserves hovered state across a ref replacement', async () => {
		const result = mount(HoverReplacementHarness, { replacement: false });
		const original = result.find('#hover-replacement');
		original.dispatchEvent(new MouseEvent('mouseenter'));
		await nextPaint();
		expect(original.textContent).toBe('hovered');

		result.update(HoverReplacementHarness, { replacement: true });
		await nextPaint();
		const replacement = result.find('#hover-replacement');
		expect(replacement).not.toBe(original);
		expect(replacement.textContent).toBe('hovered');
		result.unmount();
	});

	it('accepts Octane/native mouse events in useLongPress', () => {
		vi.useFakeTimers();
		const onLongPress = vi.fn();
		const result = mount(LongPressHarness, { onLongPress });
		const node = result.find('#long-press');

		node.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: 4, clientY: 8 }));
		vi.advanceTimersByTime(10);

		expect(onLongPress).toHaveBeenCalledOnce();
		result.unmount();
		vi.useRealTimers();
	});

	it('reads checked and value from native input event targets', () => {
		const setValue = vi.fn();
		const onChange = getInputOnChange(setValue);
		const checkbox = document.createElement('input');
		checkbox.type = 'checkbox';
		checkbox.checked = true;
		onChange({ target: checkbox } as any);
		expect(setValue).toHaveBeenLastCalledWith(true);

		const input = document.createElement('input');
		input.value = 'Octane';
		onChange({ currentTarget: input } as any);
		expect(setValue).toHaveBeenLastCalledWith('Octane');
	});

	it('emits a terminal canceled drag update before programmatic reset', () => {
		const updates: UseDragState[] = [];
		const result = mount(DragHarness, {
			onDrag(state: UseDragState) {
				updates.push(state);
				if (state.first && !state.last) {
					state.cancel();
				}
			},
		});
		const node = result.find('#drag');

		node.dispatchEvent(
			new PointerEvent('pointerdown', {
				bubbles: true,
				button: 0,
				pointerId: 1,
				clientX: 4,
				clientY: 8,
			}),
		);

		expect(updates).toHaveLength(2);
		expect(updates[1]).toMatchObject({ last: true, active: false, canceled: true });
		result.unmount();
	});
});
