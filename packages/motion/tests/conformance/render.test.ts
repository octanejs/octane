/**
 * Rendering: motion.<tag> renders a REAL host element (via octane's hostComponent
 * primitive) with spread DOM props + children. No mocking — exercises the actual
 * render path. (The animation engine runs against jsdom here; we only assert the
 * rendered DOM, not animation frames — those are covered with a mocked engine in
 * effects.test.ts.)
 */
import { describe, it, expect } from 'vitest';
import { mount } from '../_helpers';
import { Box, Span } from '../_fixtures/boxes.tsrx';

describe('motion.<tag> rendering', () => {
	it('renders a real <div> with className + children', () => {
		const r = mount(Box);
		const div = r.find('#box');
		expect(div.tagName).toBe('DIV');
		expect(div.className).toBe('card');
		expect(div.contains(r.find('#kid'))).toBe(true);
		expect(r.find('#kid').textContent).toBe('hi');
		// motion-only props are NOT leaked onto the DOM element.
		expect(div.hasAttribute('animate')).toBe(false);
		expect(div.hasAttribute('initial')).toBe(false);
		r.unmount();
	});

	it('the factory works for any tag (motion.span)', () => {
		const r = mount(Span);
		const sp = r.find('#sp');
		expect(sp.tagName).toBe('SPAN');
		expect(sp.className).toBe('lbl');
		expect(sp.textContent).toBe('label');
		r.unmount();
	});
});
