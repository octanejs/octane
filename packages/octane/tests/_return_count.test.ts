import { describe, it, expect } from 'vitest';
import { mount } from './_helpers';
import { Count } from './_fixtures/_return_count.tsrx';

describe('compiler-generated return-JSX component', () => {
	it('reconciles in place: same button node patched 0->1->2 (non-VDOM)', () => {
		const r = mount(Count as any);
		const btn = r.container.querySelector('button')!;
		expect(btn.textContent).toBe('0');
		btn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
		expect(btn.textContent).toBe('1');
		expect(r.container.querySelector('button')).toBe(btn); // SAME node — patched
		btn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
		expect(btn.textContent).toBe('2');
		expect(r.container.querySelector('button')).toBe(btn);
		r.unmount();
	});
});
