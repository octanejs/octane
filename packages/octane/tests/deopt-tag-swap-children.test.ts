import { describe, it, expect } from 'vitest';
import { mount } from './_helpers';
import { TagSwapChildren } from './_fixtures/deopt-tag-swap-children.tsrx';

// Regression: a value-position host descriptor whose children are a compiled
// children-block function (`createElement(props.tag, { children })` in a
// plain-`.ts` component — the styled-components shape). When the tag changed,
// hostElementBody recreated the element but PRESERVED the children slot, whose
// markers and content lived inside the removed element — the children kept
// rendering into the detached node and the fresh element stayed empty. The
// recreate path now tears the slot down so children remount (React parity: a
// host tag change remounts the subtree).
describe('de-opt host descriptor tag swap remounts children-block children', () => {
	it('keeps rendering children after a state-driven tag change', () => {
		const m = mount(TagSwapChildren as any);
		const before = m.find('#shell');
		expect(before.tagName).toBe('BUTTON');
		expect(before.textContent).toContain('Content');
		expect(m.find('#bold').textContent).toBe('bold');

		m.click('#swap');

		const after = m.find('#shell');
		expect(after.tagName).toBe('A');
		expect(after.textContent).toContain('Content');
		expect(m.find('#bold').textContent).toBe('bold');
		m.unmount();
	});
});
