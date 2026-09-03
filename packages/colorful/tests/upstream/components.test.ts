import { expect, it, vi } from 'vitest';
import {
	AlphaHarness,
	HexHarness,
	HslaHarness,
	HslStringHarness,
	HsvHarness,
	HsvaHarness,
	HsvaStringHarness,
	HsvStringHarness,
	InputHarness,
	RgbHarness,
	RgbaHarness,
} from './_fixtures/RuntimeHarness.tsrx';
import {
	interactive,
	mockPickerGeometry,
	mountTracked,
	mouse,
	settle,
	settleAsync,
	touchEnd,
	touchMove,
	touchStart,
} from './_helpers';

// Per packages/react-colorful/upstream/tag/tests/components.test.js — titles preserved.

it('Renders proper color picker markup', function rendersHexMarkup() {
	const root = mountTracked(HexHarness, { color: '#F00' });
	expect(root.find('.react-colorful')).not.toBeNull();
	expect(root.find('.react-colorful__saturation')).not.toBeNull();
	expect(root.find('.react-colorful__hue')).not.toBeNull();
	expect(root.findAll('[role="slider"]')).toHaveLength(2);
});

it('Renders proper alpha color picker markup', function rendersAlphaMarkup() {
	const root = mountTracked(RgbaHarness, { color: { r: 255, g: 0, b: 0, a: 0.5 } });
	expect(root.find('.react-colorful__alpha')).not.toBeNull();
	expect(root.findAll('[role="slider"]')).toHaveLength(3);
});

it('Works with no props', function worksWithNoProps() {
	const root = mountTracked(HexHarness, {});
	expect(root.find('.react-colorful')).not.toBeNull();
	expect(root.findAll('[role="slider"]')).toHaveLength(2);
});

it('Accepts an additional `className`', function acceptsClassName() {
	const root = mountTracked(RgbHarness, { className: 'custom-picker' });
	expect(root.find('.react-colorful').classList.contains('custom-picker')).toBe(true);
});

it("Doesn't trigger `onChange` after mounting", function noChangeOnMount() {
	const onChange = vi.fn();
	mountTracked(HexHarness, { color: '#c62182', onChange });
	settle();
	expect(onChange).not.toHaveBeenCalled();
});

it("Doesn't trigger `onChange` after controlled rerender", function noChangeOnRerender() {
	const onChange = vi.fn();
	const root = mountTracked(HexHarness, { color: '#c62182', onChange });
	settle();
	root.update(HexHarness, { color: '#c72282', onChange });
	settle();
	expect(onChange).not.toHaveBeenCalled();
});

it("Doesn't call `onChange` when user changes a hue of a grayscale color", function noChangeGrayscaleHue() {
	mockPickerGeometry();
	const onChange = vi.fn();
	const root = mountTracked(HexHarness, { color: '#000', onChange });
	settle();
	const hue = interactive(root, 'Hue');
	mouse(hue, 'mousedown', 5, 0);
	mouse(window, 'mousemove', 105, 0);
	settle();
	expect(onChange).not.toHaveBeenCalled();
});

it('Triggers `onChange` after a mouse interaction', async function changeAfterMouse() {
	mockPickerGeometry();
	const onChange = vi.fn();
	const root = mountTracked(RgbaHarness, { onChange });
	const saturation = interactive(root, 'Color');
	mouse(saturation, 'mousedown', 0, 0);
	mouse(window, 'mousemove', 10, 10);
	settle();
	expect(onChange).toHaveBeenCalled();
});

it('Triggers `onChangeEnd` after a mouse interaction', async function changeEndAfterMouse() {
	mockPickerGeometry();
	const onChangeEnd = vi.fn();
	const root = mountTracked(RgbaHarness, { onChangeEnd });
	const saturation = interactive(root, 'Color');
	mouse(saturation, 'mousedown', 0, 0);
	mouse(window, 'mousemove', 10, 10);
	settle();
	expect(onChangeEnd).not.toHaveBeenCalled();
	mouse(window, 'mouseup', 10, 10);
	settle();
	expect(onChangeEnd).toHaveBeenCalledTimes(1);
});

it('Triggers `onChangeEnd` after a touch interaction', async function changeEndAfterTouch() {
	mockPickerGeometry();
	const onChangeEnd = vi.fn();
	const root = mountTracked(HsvHarness, {
		color: { h: 0, s: 100, v: 100 },
		onChangeEnd,
	});
	const hue = interactive(root, 'Hue');
	touchStart(hue, 0, 0);
	touchMove(window, [{ pageX: 55, pageY: 0 }]);
	await settleAsync();
	expect(onChangeEnd).not.toHaveBeenCalled();
	touchEnd(window);
	await settleAsync();
	expect(onChangeEnd).toHaveBeenCalledWith({ h: 180, s: 100, v: 100 });
});

it('Triggers `onChangeEnd` after a keyboard interaction', async function changeEndAfterKeyboard() {
	const onChangeEnd = vi.fn();
	const root = mountTracked(HexHarness, { color: '#ff0000', onChangeEnd });
	const hue = interactive(root, 'Hue');
	hue.focus();
	hue.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, keyCode: 39 }));
	settle();
	expect(onChangeEnd).not.toHaveBeenCalled();
	hue.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, keyCode: 39 }));
	settle();
	expect(onChangeEnd).toHaveBeenCalledTimes(1);
});

it("Doesn't trigger `onChangeEnd` if the color didn't change", async function noChangeEndUnchanged() {
	mockPickerGeometry();
	const onChange = vi.fn();
	const onChangeEnd = vi.fn();
	const root = mountTracked(HexHarness, { color: '#ffffff', onChange, onChangeEnd });
	const saturation = interactive(root, 'Color');
	mouse(saturation, 'mousedown', 0, 0);
	mouse(window, 'mouseup', 0, 0);
	settle();
	expect(onChange).not.toHaveBeenCalled();
	expect(onChangeEnd).not.toHaveBeenCalled();
});

it('Triggers `onChangeEnd` when the pointer is released outside of the window', async function changeEndOutside() {
	mockPickerGeometry();
	const onChangeEnd = vi.fn();
	const root = mountTracked(RgbaHarness, { onChangeEnd });
	const saturation = interactive(root, 'Color');
	mouse(saturation, 'mousedown', 20, 10);
	mouse(window, 'mousemove', 10, 10);
	settle();
	expect(onChangeEnd).not.toHaveBeenCalled();
	mouse(window, 'mousemove', 1, 50, 0);
	settle();
	expect(onChangeEnd).toHaveBeenCalledTimes(1);
});

it("Doesn't trigger `onChangeEnd` if the color prop was updated mid-drag", async function noChangeEndMidDrag() {
	mockPickerGeometry();
	const onChange = vi.fn();
	const onChangeEnd = vi.fn();
	const root = mountTracked(RgbaHarness, { onChange, onChangeEnd });
	const saturation = interactive(root, 'Color');
	mouse(saturation, 'mousedown', 0, 0);
	mouse(window, 'mousemove', 10, 10);
	settle();
	expect(onChange).toHaveBeenCalled();
	root.update(RgbaHarness, {
		color: { r: 0, g: 255, b: 0, a: 1 },
		onChange,
		onChangeEnd,
	});
	settle();
	mouse(window, 'mouseup', 10, 10);
	settle();
	expect(onChangeEnd).not.toHaveBeenCalled();
});

it('Triggers `onChange` after a touch interaction', async function changeAfterTouch() {
	mockPickerGeometry();
	const onChange = vi.fn();
	const root = mountTracked(HsvHarness, {
		color: { h: 0, s: 100, v: 100 },
		onChange,
	});
	const hue = interactive(root, 'Hue');
	touchStart(hue, 0, 0);
	touchMove(window, [{ pageX: 55, pageY: 0 }]);
	await settleAsync();
	expect(onChange).toHaveBeenCalledWith({ h: 180, s: 100, v: 100 });
});

it('Supports multitouch', async function supportsMultitouch() {
	mockPickerGeometry();
	const onChange = vi.fn();
	const root = mountTracked(HsvaHarness, {
		color: { h: 0, s: 100, v: 100, a: 0 },
		onChange,
	});
	const hue = interactive(root, 'Hue');
	const alpha = interactive(root, 'Alpha');

	const firstFingerBefore = { pageX: 0, pageY: 0, identifier: 0 };
	const firstFingerAfter = { pageX: 55, pageY: 0, identifier: 0 };
	const secondFingerBefore = { pageX: 0, pageY: 0, identifier: 1 };
	const secondFingerAfter = { pageX: 200, pageY: 0, identifier: 1 };
	const extraTouch = { pageX: 10, pageY: 10, identifier: 2 };

	touchStart(hue, 0, 0, 0);
	touchStart(alpha, 0, 0, 1, [firstFingerBefore, secondFingerBefore]);
	touchMove(window, [firstFingerAfter, secondFingerAfter]);
	touchMove(window, [extraTouch]);
	touchMove(window, [firstFingerAfter, secondFingerAfter]);
	await settleAsync();
	expect(onChange).toHaveBeenCalledWith({ h: 180, s: 100, v: 100, a: 1 });
});

it("Pointer doesn't follow the mouse if it was released outside of the document bounds", async function ignoreButtonlessMove() {
	mockPickerGeometry();
	const onChange = vi.fn();
	const root = mountTracked(RgbaHarness, { onChange });
	const saturation = interactive(root, 'Color');
	mouse(saturation, 'mousedown', 20, 10);
	mouse(window, 'mousemove', 10, 10);
	await settleAsync();
	expect(onChange).toHaveBeenCalledTimes(2);
	// Released outside the document: no mouseup, then a buttonless move must be ignored.
	mouse(window, 'mousemove', 1, 50, 0);
	await settleAsync();
	expect(onChange).toHaveBeenCalledTimes(2);
});

it('Changes alpha channel value after an interaction', async function changesAlpha() {
	mockPickerGeometry();
	const onChange = vi.fn();
	const root = mountTracked(HslaHarness, {
		color: { h: 100, s: 0, l: 0, a: 0 },
		onChange,
	});
	const alpha = interactive(root, 'Alpha');
	mouse(alpha, 'mousedown', 105, 0);
	settle();
	expect(onChange).toHaveBeenCalledWith({ h: 100, s: 0, l: 0, a: 1 });
});

it('Uses #rrggbbaa format if alpha channel value is less than 1', async function usesRrggbbaa() {
	mockPickerGeometry();
	const onChange = vi.fn();
	const root = mountTracked(AlphaHarness, { color: '#112233', onChange });
	const alpha = interactive(root, 'Alpha');
	mouse(alpha, 'mousedown', 5, 0);
	settle();
	expect(onChange).toHaveBeenCalledWith('#11223300');
});

it("Doesn't react on mouse events after a touch interaction", async function ignoreMouseAfterTouch() {
	mockPickerGeometry();
	const onChange = vi.fn();
	const root = mountTracked(HslStringHarness, { color: 'hsl(100, 0%, 0%)', onChange });
	const hue = interactive(root, 'Hue');
	touchStart(hue, 0, 0);
	touchMove(window, [{ pageX: 55, pageY: 0 }]);
	await settleAsync();
	const afterTouchCalls = onChange.mock.calls.length;
	expect(onChange).toHaveBeenCalledWith('hsl(180, 0%, 0%)');
	mouse(hue, 'mousedown', 35, 0);
	mouse(hue, 'mousemove', 105, 0);
	await settleAsync();
	expect(onChange).toHaveBeenCalledTimes(afterTouchCalls);
	expect(onChange).toHaveBeenLastCalledWith('hsl(180, 0%, 0%)');
});

it('Captures arrow keys only', async function capturesArrowKeysOnly() {
	const onChange = vi.fn();
	const root = mountTracked(HsvStringHarness, { color: 'hsv(180, 90%, 90%)', onChange });
	const hue = interactive(root, 'Hue');
	hue.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, keyCode: 36 }));
	settle();
	expect(onChange).not.toHaveBeenCalled();
	hue.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, keyCode: 39 }));
	settle();
	expect(onChange).toHaveBeenCalled();
});

it('Changes saturation with arrow keys', async function changesSaturationKeys() {
	const onChange = vi.fn();
	const root = mountTracked(HsvaHarness, {
		color: { h: 180, s: 50, v: 50, a: 0.5 },
		onChange,
	});
	const saturation = interactive(root, 'Color');
	saturation.dispatchEvent(
		new KeyboardEvent('keydown', { bubbles: true, cancelable: true, keyCode: 39 }),
	);
	settle();
	expect(onChange).toHaveBeenCalled();
	const next = onChange.mock.calls.at(-1)?.[0] as { s: number };
	expect(next.s).toBeGreaterThan(50);
});

it('Changes hue with arrow keys', async function changesHueKeys() {
	const onChange = vi.fn();
	const root = mountTracked(HexHarness, { color: '#ff0000', onChange });
	const hue = interactive(root, 'Hue');
	hue.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, keyCode: 39 }));
	settle();
	expect(onChange).toHaveBeenLastCalledWith('#ff4d00');
});

it('Changes alpha with arrow keys', async function changesAlphaKeys() {
	const onChange = vi.fn();
	const root = mountTracked(HsvaHarness, {
		color: { h: 180, s: 50, v: 50, a: 0.5 },
		onChange,
	});
	const alpha = interactive(root, 'Alpha');
	alpha.dispatchEvent(
		new KeyboardEvent('keydown', { bubbles: true, cancelable: true, keyCode: 39 }),
	);
	settle();
	expect(onChange).toHaveBeenCalled();
	const next = onChange.mock.calls.at(-1)?.[0] as { a: number };
	expect(next.a).toBeGreaterThan(0.5);
});

it('Ignores keyboard commands if the pointer is already on a saturation edge', async function ignoreSaturationEdge() {
	const onChange = vi.fn();
	const root = mountTracked(HslStringHarness, { color: 'hsla(200, 0%, 100%, 1)', onChange });
	const saturation = interactive(root, 'Color');
	saturation.dispatchEvent(
		new KeyboardEvent('keydown', { bubbles: true, cancelable: true, keyCode: 38 }),
	);
	saturation.dispatchEvent(
		new KeyboardEvent('keydown', { bubbles: true, cancelable: true, keyCode: 37 }),
	);
	settle();
	expect(onChange).not.toHaveBeenCalled();
});

it('Ignores keyboard commands if the pointer is already on a alpha edge', async function ignoreAlphaEdge() {
	const onChange = vi.fn();
	const root = mountTracked(HsvaStringHarness, { color: 'hsva(0, 0%, 0%, 1)', onChange });
	const alpha = interactive(root, 'Alpha');
	alpha.dispatchEvent(
		new KeyboardEvent('keydown', { bubbles: true, cancelable: true, keyCode: 39 }),
	);
	settle();
	expect(onChange).not.toHaveBeenCalled();
});

it('Sets proper `aria-valuetext` attribute value', async function setsAriaValueText() {
	mockPickerGeometry();
	const root = mountTracked(RgbaHarness, { color: { r: 0, g: 0, b: 0, a: 0 } });
	const saturation = interactive(root, 'Color');
	const alpha = interactive(root, 'Alpha');
	expect(saturation.getAttribute('aria-valuetext')).toBe('Saturation 0%, Brightness 0%');
	expect(alpha.getAttribute('aria-valuetext')).toBe('0%');
	mouse(saturation, 'mousedown', 5, 0);
	mouse(window, 'mousemove', 500, 0);
	mouse(alpha, 'mousedown', 5, 0);
	mouse(window, 'mousemove', 500, 0);
	settle();
	expect(saturation.getAttribute('aria-valuetext')).toBe('Saturation 100%, Brightness 100%');
	expect(alpha.getAttribute('aria-valuetext')).toBe('100%');
});

it('Accepts any valid `div` attributes', function acceptsDivAttributes() {
	const root = mountTracked(HexHarness, { id: 'picker', 'data-extra': 'yes' });
	const picker = root.find('#picker') as HTMLElement;
	expect(picker.dataset.extra).toBe('yes');
});

it('Supports any event that a regular div does', function supportsDivEvents() {
	const onClick = vi.fn();
	const root = mountTracked(HexHarness, { onClick });
	(root.find('.react-colorful') as HTMLElement).click();
	expect(onClick).toHaveBeenCalledTimes(1);
});

it('Renders `HexColorInput` component properly', function rendersHexInput() {
	const root = mountTracked(InputHarness, { color: '#aabbcc' });
	const input = root.find('input') as HTMLInputElement;
	expect(input.value.toLowerCase()).toBe('aabbcc');
});

it('Fires `onChange` when user changes `HexColorInput` value', function firesInputChange() {
	const onChange = vi.fn();
	const root = mountTracked(InputHarness, { color: '#123456', onChange });
	settle();
	const input = root.find('input') as HTMLInputElement;
	input.value = 'AABBCC';
	input.dispatchEvent(new InputEvent('input', { bubbles: true }));
	settle();
	expect(onChange).toHaveBeenLastCalledWith('#AABBCC');
});

it('Fires custom `onBlur` when `HexColorInput` has lost focus', function firesInputBlur() {
	const onBlur = vi.fn();
	const root = mountTracked(InputHarness, { color: '#112233', onBlur });
	const input = root.find('input') as HTMLInputElement;
	input.focus();
	expect(document.activeElement).toBe(input);
	input.blur();
	settle();
	expect(onBlur).toHaveBeenCalledTimes(1);
	expect(onBlur.mock.calls[0]![0].type).toBe('focusout');
	expect(onBlur.mock.calls[0]![0].target).toBe(input);
});

it('Displays `#` prefix in `HexColorInput` if `prefixed` is turned on', function displaysPrefix() {
	const root = mountTracked(InputHarness, { color: '#123456', prefixed: true });
	settle();
	const input = root.find('input') as HTMLInputElement;
	expect(input.value).toBe('#123456');
});

it('Allows to enter `#rgba` and `#rrggbbaa` in `HexColorInput` if `alpha` is turned on', function allowsAlphaHex() {
	const onChange = vi.fn();
	const root = mountTracked(InputHarness, {
		color: '#11223344',
		alpha: true,
		prefixed: true,
		onChange,
	});
	settle();
	const input = root.find('input') as HTMLInputElement;
	expect(input.value).toBe('#11223344');
	input.value = '#ABCD';
	input.dispatchEvent(new InputEvent('input', { bubbles: true }));
	settle();
	expect(onChange).toHaveBeenCalled();
});

it('Does not allow to enter `#rrggbbaa` in `HexColorInput` if `alpha` is turned off', function rejectsAlphaHex() {
	const onChange = vi.fn();
	const root = mountTracked(InputHarness, { color: '#123456', prefixed: true, onChange });
	settle();
	const input = root.find('input') as HTMLInputElement;
	input.value = '#AABBCCDD';
	input.dispatchEvent(new InputEvent('input', { bubbles: true }));
	settle();
	expect(input.value).toBe('#AABBCC');
	expect(onChange).toHaveBeenLastCalledWith('#AABBCC');
});
