import { describe, expect, it, vi } from 'vitest';
import { mount, nextPaint } from '../_helpers';
import {
	DraggableWindowHarness,
	FloatingWindowHarness,
} from '../_fixtures/floating-window-hooks.tsrx';

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

	it('reports each drag callback and honors enabled', async () => {
		vi.stubGlobal(
			'ResizeObserver',
			class {
				observe() {}
				disconnect() {}
			},
		);
		const log: string[] = [];
		const result = mount(DraggableWindowHarness, {
			enabled: true,
			log: (event) => log.push(event),
		});
		try {
			await nextPaint();
			const drag = () => {
				result
					.find('#floating-window')
					.dispatchEvent(
						new MouseEvent('mousedown', { bubbles: true, button: 0, clientX: 10, clientY: 10 }),
					);
				document.dispatchEvent(new MouseEvent('mousemove', { clientX: 40, clientY: 30 }));
				document.dispatchEvent(new MouseEvent('mouseup'));
			};

			drag();
			expect(log).toEqual(['start', 'move:30,20', 'end']);

			log.length = 0;
			result.update(DraggableWindowHarness, { enabled: false, log: (event) => log.push(event) });
			await nextPaint();
			drag();
			expect(log).toEqual([]);
		} finally {
			result.unmount();
			vi.unstubAllGlobals();
		}
	});
});
