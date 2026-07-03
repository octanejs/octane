import { describe, it, expect } from 'vitest';
import { mount } from './_helpers';
import {
	MixedRootsIf,
	MixedRootsFor,
	ForOnlyWithSibling,
	TryOnlyWithSibling,
	SwitchOnlyWithSibling,
} from './_fixtures/multi-root-constructs.tsrx';

// Assert `a` renders BEFORE `b` in document order.
function expectBefore(a: Element, b: Element) {
	// DOCUMENT_POSITION_FOLLOWING (4): b follows a.
	expect(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING).toBe(4);
}

describe('top-level constructs in multi-root bodies', () => {
	it('renders an @if between static roots at its source position', () => {
		const r = mount(MixedRootsIf, { show: true, label: 'one', cls: 'x' });
		expectBefore(r.find('#before'), r.find('#cond'));
		expectBefore(r.find('#cond'), r.find('#after'));
		r.unmount();
	});

	it('keeps a bound static sibling AFTER the @if working (htmlIdx alignment)', () => {
		const r = mount(MixedRootsIf, { show: true, label: 'one', cls: 'x' });
		expect(r.find('#after').textContent).toBe('one');
		expect(r.find('#after').className).toBe('x');
		r.update(MixedRootsIf, { show: false, label: 'two', cls: 'y' });
		expect(r.findAll('#cond')).toHaveLength(0);
		expect(r.find('#after').textContent).toBe('two');
		expect(r.find('#after').className).toBe('y');
		// Re-show — the branch must come back BETWEEN the static roots.
		r.update(MixedRootsIf, { show: true, label: 'three', cls: 'z' });
		expectBefore(r.find('#before'), r.find('#cond'));
		expectBefore(r.find('#cond'), r.find('#after'));
		expect(r.find('#after').textContent).toBe('three');
		r.unmount();
	});

	it('renders an @for between static roots at its source position', () => {
		const r = mount(MixedRootsFor, { items: ['a', 'b'], note: 'n1' });
		const rows = r.findAll('.item');
		expect(rows.map((el) => el.textContent)).toEqual(['a', 'b']);
		expectBefore(r.find('#head'), rows[0]);
		expectBefore(rows[1], r.find('#foot'));
		expect(r.find('#foot').textContent).toBe('n1');
		r.update(MixedRootsFor, { items: ['b', 'c', 'a'], note: 'n2' });
		const rows2 = r.findAll('.item');
		expect(rows2.map((el) => el.textContent)).toEqual(['b', 'c', 'a']);
		expectBefore(r.find('#head'), rows2[0]);
		expectBefore(rows2[2], r.find('#foot'));
		expect(r.find('#foot').textContent).toBe('n2');
		r.unmount();
	});
});

describe('control-flow-only component bodies next to later siblings', () => {
	it('@for-only body renders inside its component range, before the sibling', () => {
		const r = mount(ForOnlyWithSibling, { items: ['a', 'b'] });
		const rows = r.findAll('.row');
		expect(rows.map((el) => el.textContent)).toEqual(['a', 'b']);
		expectBefore(rows[1], r.find('#tail'));
		r.update(ForOnlyWithSibling, { items: ['c', 'a', 'b'] });
		const rows2 = r.findAll('.row');
		expect(rows2.map((el) => el.textContent)).toEqual(['c', 'a', 'b']);
		expectBefore(rows2[2], r.find('#tail'));
		r.unmount();
	});

	it('@try-only body renders inside its component range, before the sibling', () => {
		const r = mount(TryOnlyWithSibling, { label: 'ok' });
		expect(r.find('.tried').textContent).toBe('ok');
		expectBefore(r.find('.tried'), r.find('#try-tail'));
		r.unmount();
	});

	it('@switch-only body renders inside its component range, before the sibling', () => {
		const r = mount(SwitchOnlyWithSibling, { mode: 'a' });
		expect(r.find('.mode').textContent).toBe('A');
		expectBefore(r.find('.mode'), r.find('#switch-tail'));
		r.update(SwitchOnlyWithSibling, { mode: 'z' });
		expect(r.find('.mode').textContent).toBe('D');
		expectBefore(r.find('.mode'), r.find('#switch-tail'));
		r.unmount();
	});
});
