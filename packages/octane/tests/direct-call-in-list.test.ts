import { describe, it, expect } from 'vitest';
import { mount } from './_helpers.js';
import { StampList, StampRow, StampSingle } from './_fixtures/direct-call-in-list.tsx';

// A return-JSX component may be invoked as a plain function (`StampRow({...})`)
// rather than as JSX. When that direct call sits inside a `.map` callback of a
// sibling component in the same module, each compiled wrapper must keep its own
// body: the list renders one row per item and the row component stays usable
// on its own.
describe('direct component call inside a .map callback', () => {
	it('renders one row per item through the sibling component', () => {
		const r = mount(StampList as any, { labels: ['one', '', 'two'] });
		const rows = r.findAll('.stamps li');
		expect(rows.map((row) => row.textContent)).toEqual(['one', '(empty)', 'two']);
		expect(rows[1].className).toBe('stamp empty');
		r.unmount();
	});

	it('renders a bare direct call outside any callback', () => {
		const r = mount(StampSingle as any, { label: 'only' });
		expect(r.find('.stamps .stamp').textContent).toBe('only');
		r.unmount();
	});

	it('keeps the row component independently mountable', () => {
		const r = mount(StampRow as any, { label: 'solo' });
		expect(r.find('.stamp').textContent).toBe('solo');
		r.unmount();
	});
});
