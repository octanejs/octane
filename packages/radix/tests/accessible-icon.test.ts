import { describe, it, expect } from 'vitest';
import { mount, flushEffects } from '../../octane/tests/_helpers';
import { AccessibleIconApp } from './_fixtures/accessible-icon.tsx';

describe('@octanejs/radix — AccessibleIcon', () => {
	it('hides the icon from ATs and announces the label via VisuallyHidden', () => {
		const r = mount(AccessibleIconApp);
		flushEffects();
		const icon = r.container.querySelector('[data-testid="icon"]')!;
		expect(icon.getAttribute('aria-hidden')).toBe('true');
		expect(icon.getAttribute('focusable')).toBe('false');
		// The label renders in a visually-hidden span.
		const label = Array.from(r.container.querySelectorAll('span')).find(
			(s) => s.textContent === 'Close',
		)!;
		expect(label).not.toBe(undefined);
		expect(label.style.position).toBe('absolute');
		expect(label.style.width).toBe('1px');
		r.unmount();
	});
});
