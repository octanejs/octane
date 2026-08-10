import { describe, expect, it, vi } from 'vitest';
import { mount, nextPaint } from '../../../../packages/octane/tests/_helpers';
import { resolveDemo } from '../catalog';
import { AlienSignalsDemo } from './AlienSignals.tsrx';

describe('Alien Signals playground demo', () => {
	it('is catalogued and exercises writable, computed, and cleanup behavior', async () => {
		const info = vi.spyOn(console, 'info').mockImplementation(() => {});
		const demo = resolveDemo('alien-signals');
		const result = mount(AlienSignalsDemo);
		await nextPaint();

		try {
			expect(demo.Component).toBe(AlienSignalsDemo);
			expect(demo.source).toContain("from '@octanejs/alien-signals'");
			expect(result.find('#alien-signals-count').textContent).toBe('Count: 1');
			expect(result.find('#alien-signals-doubled').textContent).toBe('Doubled: 2');

			expect(info).toHaveBeenCalledWith('[alien-signals] effect region mounted');
			info.mockClear();

			result.click('#alien-signals-increment');
			await nextPaint();
			expect(result.find('#alien-signals-count').textContent).toBe('Count: 2');
			expect(result.find('#alien-signals-doubled').textContent).toBe('Doubled: 4');
			expect(result.find('#alien-signals-effect').textContent).toBe('Effect region is observing 2');
			expect(info).not.toHaveBeenCalledWith('[alien-signals] effect cleanup');

			result.click('#alien-signals-toggle-effect');
			await nextPaint();
			expect(info).toHaveBeenCalledWith('[alien-signals] effect cleanup');
		} finally {
			result.unmount();
			info.mockRestore();
		}
	});
});
