import { describe, expect, it, vi } from 'vitest';
import { mount, nextPaint } from '../_helpers';
import {
	MediaQueryOmittedOptionsHarness,
	MouseLifecycleHarness,
	MoveDefaultDirectionHarness,
	OmittedOptionsHarness,
} from '../_fixtures/slot-regression-hooks.tsrx';

describe('@octanejs/mantine-hooks compiler slot regressions', () => {
	it('keeps useMove LTR when the direction argument is omitted', async () => {
		vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
			callback(0);
			return 1;
		});
		vi.stubGlobal('cancelAnimationFrame', vi.fn());
		const onChange = vi.fn();
		const result = mount(MoveDefaultDirectionHarness, { onChange });
		await nextPaint();
		const target = result.find('#move-target') as HTMLElement;
		vi.spyOn(target, 'getBoundingClientRect').mockReturnValue({
			x: 0,
			y: 0,
			left: 0,
			top: 0,
			right: 100,
			bottom: 100,
			width: 100,
			height: 100,
			toJSON: () => ({}),
		});

		target.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: 25, clientY: 50 }));
		expect(onChange).toHaveBeenCalledWith({ x: 0.25, y: 0.5 });

		result.unmount();
		vi.unstubAllGlobals();
	});

	it('uses default useMediaQuery options when they are omitted in TSRX', () => {
		vi.stubGlobal(
			'matchMedia',
			vi.fn(() => ({
				matches: false,
				addEventListener: vi.fn(),
				removeEventListener: vi.fn(),
			})),
		);
		const result = mount(MediaQueryOmittedOptionsHarness, {});
		expect(result.find('#media-result').textContent).toBe('narrow');
		result.unmount();
		vi.unstubAllGlobals();
	});

	it('tracks the document without a ref, switches to the node, and restores document tracking', async () => {
		const result = mount(MouseLifecycleHarness, { attached: false });
		await nextPaint();
		document.dispatchEvent(new MouseEvent('mousemove', { clientX: 11, clientY: 12 }));
		await nextPaint();
		expect(result.find('#mouse-position').textContent).toBe('11,12');

		result.update(MouseLifecycleHarness, { attached: true });
		await nextPaint();
		const target = result.find('#mouse-target') as HTMLElement;
		vi.spyOn(target, 'getBoundingClientRect').mockReturnValue({
			x: 10,
			y: 20,
			left: 10,
			top: 20,
			right: 110,
			bottom: 120,
			width: 100,
			height: 100,
			toJSON: () => ({}),
		});
		target.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: 35, clientY: 60 }));
		await nextPaint();
		expect(result.find('#mouse-position').textContent).toBe('25,40');

		result.update(MouseLifecycleHarness, { attached: false });
		await nextPaint();
		document.dispatchEvent(new MouseEvent('mousemove', { clientX: 7, clientY: 8 }));
		await nextPaint();
		expect(result.find('#mouse-position').textContent).toBe('7,8');
		result.unmount();
	});

	it('applies public defaults when TSRX omits hook options', () => {
		vi.useFakeTimers();
		const onTimeout = vi.fn();
		const result = mount(OmittedOptionsHarness, { onTimeout });

		expect(result.find('#clipboard-default').textContent).toBe('idle');
		expect(result.find('#disclosure-default').textContent).toBe('closed');
		expect(result.find('#hash-default').textContent).toBe('empty');
		expect(result.find('#toggle-default').textContent).toBe('off');

		result.click('#open-disclosure');
		result.click('#toggle-default-value');
		result.click('#start-timeout');
		expect(result.find('#disclosure-default').textContent).toBe('open');
		expect(result.find('#toggle-default').textContent).toBe('on');
		expect(onTimeout).not.toHaveBeenCalled();

		vi.advanceTimersByTime(10);
		expect(onTimeout).toHaveBeenCalledOnce();
		result.unmount();
		vi.useRealTimers();
	});
});
