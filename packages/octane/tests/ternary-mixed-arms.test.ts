import { describe, it, expect } from 'vitest';
import { mount } from './_helpers';
import {
	MapArm,
	StringArm,
	VarArm,
	NestedTernary,
	NullConsequent,
	UndefinedArm,
	AndArm,
	ChildrenArm,
	ReturnedArm,
} from './_fixtures/ternary-mixed-arms.tsrx';

// `{cond ? A : B}` at a child hole renders the taken arm's VALUE whatever its
// shape — matching React. The regression: when exactly one arm was a JSX
// literal, the other arm's value (an array from `.map`, a string, a variable
// holding an element, a nested ternary, a primitive) was silently discarded
// and the hole rendered empty. A `null` consequent crashed the compiler.

function host(r: ReturnType<typeof mount>): HTMLElement {
	return r.find('.host') as HTMLElement;
}

describe('ternary child holes — non-JSX arm renders its value', () => {
	it('keeps value arms live in a returned tree', () => {
		const root = mount(ReturnedArm, { on: false, label: 'first' });
		try {
			const element = host(root);
			expect(element.textContent).toBe('first');
			root.update(ReturnedArm, { on: false, label: 'second' });
			expect(host(root)).toBe(element);
			expect(element.textContent).toBe('second');
			root.update(ReturnedArm, { on: true, label: 'second' });
			expect(element.querySelector('b')?.textContent).toBe('yes');
			root.update(ReturnedArm, { on: false, label: ['back', ' again'] });
			expect(element.textContent).toBe('back again');
			expect(element.querySelector('b')).toBeNull();
		} finally {
			root.unmount();
		}
	});

	it('keyed `.map` array arm ⇄ component arm (reported repro)', () => {
		const r = mount(MapArm as any);
		// mode 0 → the map arm: two keyed <i> items.
		expect(r.findAll('.host i').map((n) => n.textContent)).toEqual(['x', 'y']);
		expect(host(r).textContent).toBe('xy');

		r.click('.next'); // mode 1 → <Chip/>
		expect(r.findAll('.host i')).toHaveLength(0);
		expect(r.find('.host em').textContent).toBe('chip');

		r.click('.next'); // mode 2 → back to the array
		expect(r.findAll('.host i').map((n) => n.textContent)).toEqual(['x', 'y']);
		r.unmount();
	});

	it('string arm renders as text and survives round trips', () => {
		const r = mount(StringArm as any);
		expect(host(r).textContent).toBe('nope');

		r.click('.flip');
		expect(r.find('.host b').textContent).toBe('yes');

		r.click('.flip');
		expect(host(r).textContent).toBe('nope');
		expect(host(r).querySelector('b')).toBeNull();
		r.unmount();
	});

	it('element held in a setup variable renders', () => {
		const r = mount(VarArm as any);
		expect(r.find('.host i').textContent).toBe('alt');

		r.click('.flip');
		expect(r.find('.host b').textContent).toBe('yes');

		r.click('.flip');
		expect(r.find('.host i').textContent).toBe('alt');
		r.unmount();
	});

	it('nested ternary chain renders every level, including a falsy 0 tail', () => {
		const r = mount(NestedTernary as any);
		expect(host(r).textContent).toBe('0'); // n=2 → the `0` tail must not vanish

		r.click('.next'); // n=3 → first arm
		expect(r.find('.host b').textContent).toBe('a');

		r.click('.next'); // n=4 → middle arm
		expect(r.find('.host i').textContent).toBe('b');

		r.click('.next'); // n=5 → tail again
		expect(host(r).textContent).toBe('0');
		r.unmount();
	});

	it('null consequent compiles and renders an empty branch', () => {
		const r = mount(NullConsequent as any);
		expect(host(r).textContent).toBe('');
		expect(host(r).children).toHaveLength(0);

		r.click('.flip');
		expect(r.find('.host b').textContent).toBe('no');

		r.click('.flip');
		expect(host(r).textContent).toBe('');
		r.unmount();
	});

	it('undefined arm renders nothing, like React', () => {
		const r = mount(UndefinedArm as any);
		expect(host(r).textContent).toBe('');
		expect(host(r).children).toHaveLength(0);

		r.click('.flip');
		expect(r.find('.host b').textContent).toBe('yes');

		r.click('.flip');
		expect(host(r).textContent).toBe('');
		r.unmount();
	});

	it('component-children ternary renders both arms through the value path', () => {
		const r = mount(ChildrenArm as any);
		expect(r.find('.host section').textContent).toBe('nope');

		r.click('.flip');
		expect(r.find('.host section b').textContent).toBe('yes');

		r.click('.flip');
		expect(r.find('.host section').textContent).toBe('nope');
		expect(r.find('.host section').querySelector('b')).toBeNull();
		r.unmount();
	});

	it('logical && arm renders the element when truthy and nothing when false', () => {
		const r = mount(AndArm as any);
		expect(r.find('.host i').textContent).toBe('maybe'); // n=0 → true && <i>

		r.click('.next'); // n=1 → JSX arm
		expect(r.find('.host b').textContent).toBe('jsx');

		r.click('.next'); // n=2 → JSX arm
		expect(r.find('.host b').textContent).toBe('jsx');

		r.click('.next'); // n=3 → false && <i> → empty
		expect(host(r).textContent).toBe('');
		expect(host(r).children).toHaveLength(0);
		r.unmount();
	});
});
