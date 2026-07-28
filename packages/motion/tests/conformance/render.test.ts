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
import { TsxDescriptorChildren, ToggleableTsxChildren } from '../_fixtures/tsx-descriptor-children';

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

	it('renders and updates descriptor children produced by a TSX value position', () => {
		const r = mount(TsxDescriptorChildren, { first: 'first', second: 'second' });
		const motionDiv = r.find('#tsx-motion');
		expect(motionDiv.textContent).toBe('firstsecond');
		expect(motionDiv.contains(r.find('#tsx-first'))).toBe(true);
		expect(motionDiv.contains(r.find('#tsx-second'))).toBe(true);

		r.update(TsxDescriptorChildren, { first: 'updated', second: 'children' });
		expect(motionDiv.textContent).toBe('updatedchildren');
		r.unmount();
	});

	it('clears descriptor children when the TSX value position goes null', () => {
		const r = mount(ToggleableTsxChildren, { show: true });
		const motionDiv = r.find('#tsx-toggle');
		expect(motionDiv.textContent).toBe('kid');

		r.update(ToggleableTsxChildren, { show: false });
		expect(motionDiv.textContent).toBe('');
		expect(r.container.querySelector('#tsx-toggle-kid')).toBe(null);

		// …and comes back, so the cleared slot is still reconcilable.
		r.update(ToggleableTsxChildren, { show: true });
		expect(motionDiv.textContent).toBe('kid');
		r.unmount();
	});
});
