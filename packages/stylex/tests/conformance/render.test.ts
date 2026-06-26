import { describe, it, expect } from 'vitest';
import { mount } from '../_helpers';
import { Card, Empty } from '../_fixtures/card.tsrx';

// End-to-end: a `.tsrx` fixture is compiled by octane() then StyleX-compiled by
// stylex() (both plugins are configured for this vitest project). So the mounted
// host element must carry the atomic class that StyleX generated from `props()` —
// proving the build-time pipeline AND that StyleX's `className` lands on an octane
// host element (octane's spread maps className -> class).

describe('stylex props applied to octane host elements', () => {
	it('a static style compiles to an atomic class on the element', () => {
		const r = mount(Card as any, { on: false });
		const cls = (r.find('[data-test="card"]').getAttribute('class') || '').trim();
		expect(cls.length).toBeGreaterThan(0); // compiled + applied (not a raw stylex.props call)
		expect(cls.split(/\s+/).length).toBe(2); // padding + color = two atomic classes
		r.unmount();
	});

	it('conditional merge changes the class (last-wins precedence)', () => {
		const off = mount(Card as any, { on: false });
		const clsOff = (off.find('[data-test="card"]').getAttribute('class') || '').trim();
		off.unmount();

		const on = mount(Card as any, { on: true });
		const clsOn = (on.find('[data-test="card"]').getAttribute('class') || '').trim();
		on.unmount();

		expect(clsOn).not.toBe(clsOff); // the color atomic token was replaced
		expect(clsOn.split(/\s+/).length).toBe(2); // still padding + (overridden) color
	});

	it('an all-falsy props() leaves the element with no class', () => {
		const r = mount(Empty as any, { on: false });
		const cls = r.find('[data-test="empty"]').getAttribute('class');
		expect(cls == null || cls === '').toBe(true);
		r.unmount();
	});
});
