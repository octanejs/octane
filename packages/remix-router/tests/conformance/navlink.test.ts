/**
 * <NavLink> (Phase C) — active/pending state derivation, the default `active`
 * class, `end`/`caseSensitive`, and the className/style/children render props.
 * Ported per react-router __tests__/dom/nav-link-active-test.tsx.
 */
import { describe, it, expect } from 'vitest';
import { mount, nextPaint } from '../_helpers';
import { NavLinkApp, PendingNavLinkApp, pendingGate } from '../_fixtures/navlink.tsrx';

async function flush() {
	for (let i = 0; i < 4; i++) {
		await new Promise((r) => setTimeout(r, 0));
		await nextPaint();
	}
}

describe('<NavLink> active state', () => {
	it('applies the default "active" class and aria-current="page" when the location matches', async () => {
		// Per nav-link-active-test.tsx "applies its default className correctly when active".
		const r = mount(NavLinkApp, { initial: '/users' });
		await flush();
		const users = r.find('#nl-users');
		expect(users.getAttribute('class')).toBe('active');
		expect(users.getAttribute('aria-current')).toBe('page');
		const home = r.find('#nl-home');
		expect(home.getAttribute('class')).toBe('');
		expect(home.getAttribute('aria-current')).toBe(null);
		r.unmount();
	});

	it('stays active on descendant paths unless `end` is set', async () => {
		// Per nav-link-active-test.tsx "matches when the url has a trailing slash" /
		// "does not match when `end` is used and descendant paths match".
		const r = mount(NavLinkApp, { initial: '/users/7' });
		await flush();
		expect(r.find('#nl-users').getAttribute('class')).toBe('active');
		expect(r.find('#nl-users-end').getAttribute('class')).toBe('');
		r.unmount();
	});

	it('is case-insensitive by default and exact with caseSensitive', async () => {
		// Per nav-link-active-test.tsx caseSensitive cases.
		const r = mount(NavLinkApp, { initial: '/about' });
		await flush();
		// The caseSensitive link points at /About — not active at /about.
		expect(r.find('#nl-case').getAttribute('class')).toBe('');
		// The default-sensitivity fn link IS active.
		expect(r.find('#nl-fn').getAttribute('class')).toBe('is-on');
		r.unmount();
	});

	it('supports className/style/children render props receiving { isActive }', async () => {
		// Per nav-link-active-test.tsx "applies its className correctly when a function is passed".
		const r = mount(NavLinkApp, { initial: '/users' });
		await flush();
		expect(r.find('#nl-fn').getAttribute('class')).toBe('is-off');
		expect(r.find('#nl-style').getAttribute('style')).toBe(null);
		expect(r.find('#nl-child-fn').textContent).toBe('ON');
		r.unmount();

		const r2 = mount(NavLinkApp, { initial: '/about' });
		await flush();
		expect(r2.find('#nl-fn').getAttribute('class')).toBe('is-on');
		expect(r2.find('#nl-style').getAttribute('style')).toContain('font-weight');
		expect(r2.find('#nl-child-fn').textContent).toBe('OFF');
		r2.unmount();
	});

	it('marks the target link "pending" during a slow data-router navigation', async () => {
		// Per nav-link-active-test.tsx "applies the default \"pending\" class when a navigation is pending".
		pendingGate.resolve = null;
		const r = mount(PendingNavLinkApp, {});
		await flush();
		expect(r.find('#np-slow').getAttribute('class')).toBe('');

		r.click('#np-slow');
		await flush();
		expect(r.find('#np-slow').getAttribute('class')).toBe('pending');

		pendingGate.resolve!();
		await flush();
		expect(r.find('#np-slow').getAttribute('class')).toBe('active');
		expect(r.find('h1').textContent).toBe('Slow');
		r.unmount();
	});
});
