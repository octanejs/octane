import { describe, it, expect, vi } from 'vitest';
import { mount } from './_helpers.js';
import { evt1 } from '../src/index.js';
import { ClickCounter } from './_fixtures/solid-event-coexist.tsrx';

describe('delegated event slots vs Solid $$event walkers', () => {
	it('publishes evt* bundles as callable no-ops for Solid-style handler.call', () => {
		const el = document.createElement('button');
		const listener = vi.fn();
		const slot = evt1(el, '$$click', listener, 1);
		expect(typeof slot).toBe('function');
		expect(typeof (el as any).$$click).toBe('function');

		// Solid's document walker: `handler.call(node, event)` — must not throw
		// and must not run the Octane listener.
		expect(() => (slot as unknown as Function).call(el, new MouseEvent('click'))).not.toThrow();
		expect(listener).not.toHaveBeenCalled();
	});

	it('still fires the authored listener through Octane delegation', async () => {
		const r = mount(ClickCounter);
		const button = r.find('[data-testid="click-counter"]') as HTMLButtonElement;
		expect(button.textContent).toBe('0');
		button.click();
		await Promise.resolve();
		await Promise.resolve();
		expect(button.textContent).toBe('1');
		r.unmount();
	});
});
