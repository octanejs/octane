// Smoke-level conformance: a styled host tag renders with its stable
// componentId class plus a generated class, injects its rules once, and
// re-generates on dynamic prop changes.
import { describe, expect, it } from 'vitest';

import { getRenderedCSS, mount } from '../_helpers';
import { SmokeApp } from '../_fixtures/basic-smoke.tsrx';

describe('basic styling', () => {
	it('renders a styled tag with componentId + generated classes and injects css', () => {
		const m = mount(SmokeApp as any);

		const title = m.find('#title');
		expect(title.tagName).toBe('H1');
		const classes = (title.getAttribute('class') ?? '').split(/\s+/).filter(Boolean);
		// folded/base componentId class plus the content-derived generated class
		expect(classes.length).toBeGreaterThanOrEqual(2);
		expect(getRenderedCSS()).toContain('color:red');

		m.unmount();
	});

	it('re-generates styles when a transient prop changes and filters it from the DOM', () => {
		const m = mount(SmokeApp as any);

		const btn = m.find('#btn');
		expect(btn.hasAttribute('$variant')).toBe(false);
		expect(getRenderedCSS()).toContain('color:gray');
		const before = btn.getAttribute('class');

		m.click('#btn');

		expect(getRenderedCSS()).toContain('color:blue');
		const after = m.find('#btn').getAttribute('class');
		expect(after).not.toBe(before);

		m.unmount();
	});
});
