import { describe, it, expect } from 'vitest';
import { createElement, positionalChildren, useState } from 'octane';
import { mount } from './_helpers';

// React identity semantics for MIXED fragment children in the de-opt list
// path: each top-level position is its own reconciliation slot, and a nested
// `.map()` array's leaves key WITHIN that slot (compound `<pos>:<key>` keys).
// A length change in the nested list must therefore never shift a SIBLING's
// implicit key — `<>{items.map(...)}<button/></>` keeps the button's physical
// node across appends (React keeps its fiber; a flat positional index would
// remount it every time the list grows). Surfaced by the react-hook-form
// port's useFieldArray rules test (captured append button went stale).

function List() {
	const [items, setItems] = useState(['a']);
	return createElement(
		'div',
		null,
		positionalChildren([
			items.map((v) => createElement('span', { key: v, 'data-testid': `s-${v}` }, v)),
			createElement(
				'button',
				{ 'data-testid': 'add', onClick: () => setItems((p) => [...p, `x${p.length}`]) },
				'add',
			),
		]),
	);
}

describe('de-opt mixed fragment children keys', () => {
	it('a sibling after a growing .map() list keeps its physical node', () => {
		const r = mount(List);
		const btn = r.find('[data-testid="add"]');
		r.click('[data-testid="add"]');
		r.click('[data-testid="add"]');
		expect(r.findAll('span').map((s) => s.textContent)).toEqual(['a', 'x1', 'x2']);
		expect(r.find('[data-testid="add"]')).toBe(btn);
		// list items themselves keep identity too
		const sA = r.find('[data-testid="s-a"]');
		r.click('[data-testid="add"]');
		expect(r.find('[data-testid="s-a"]')).toBe(sA);
		expect(r.find('[data-testid="add"]')).toBe(btn);
		r.unmount();
	});
});
