import { describe, expect, it, vi } from 'vitest';
import { mount, nextPaint } from '../_helpers';
import { FloatingWindowHarness } from '../_fixtures/floating-window-hooks.tsrx';

describe('@octanejs/mantine-hooks useFloatingWindow', () => {
	it('observes an element attached after the initial effect and disconnects on removal', async () => {
		const observers: Array<{
			observe: ReturnType<typeof vi.fn>;
			disconnect: ReturnType<typeof vi.fn>;
		}> = [];
		vi.stubGlobal(
			'ResizeObserver',
			class {
				observe = vi.fn();
				disconnect = vi.fn();

				constructor() {
					observers.push(this);
				}
			},
		);

		const result = mount(FloatingWindowHarness, { show: false });
		expect(observers).toHaveLength(0);

		result.update(FloatingWindowHarness, { show: true });
		await nextPaint();
		expect(observers).toHaveLength(1);
		expect(observers[0].observe).toHaveBeenCalledWith(result.find('#floating-window'));

		result.update(FloatingWindowHarness, { show: false });
		await nextPaint();
		expect(observers[0].disconnect).toHaveBeenCalledOnce();

		result.unmount();
		vi.unstubAllGlobals();
	});
});
