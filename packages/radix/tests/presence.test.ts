import { describe, it, expect } from 'vitest';
import { mount } from '../../octane/tests/_helpers';
import { PresenceApp } from './_fixtures/presence.tsx';

// Presence in isolation: with a descriptor child (no forceMount), the child mounts while
// present and unmounts once not present (jsdom has no running animation → immediate).
describe('@octanejs/radix — Presence', () => {
	it('mounts/unmounts the child as `present` toggles', () => {
		const r = mount(PresenceApp);
		expect(r.container.querySelector('[data-testid="box"]')).not.toBe(null);

		r.click('[data-testid="toggle"]'); // present → false
		expect(r.container.querySelector('[data-testid="box"]')).toBe(null);

		r.click('[data-testid="toggle"]'); // present → true
		expect(r.container.querySelector('[data-testid="box"]')).not.toBe(null);
		r.unmount();
	});
});
