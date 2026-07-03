import { describe, it, expect } from 'vitest';
import { mount, flushEffects } from './_helpers';
import { createElement, flushSync, useEffect, useState } from '../src/index.js';

// Regression: deoptItemBody assumed one item scope "either always holds Blocks or
// never does" — but an UNKEYED `{cond ? <Comp/> : null}` sits at a stable INDEX key
// and flips between the Blocks path (component) and the pure path (null/text/host).
// The pure path never tore down the Blocks residue: the toggled-off component's DOM
// (and live effects) stayed in the item range forever (real-world: Radix collection
// items with component siblings — Toast/OTP shapes).
const log: string[] = [];
let setOnFn: ((v: any) => void) | null = null;

function Leaf(props: any) {
	useEffect(
		() => {
			log.push('mount:' + props.tag);
			return () => log.push('unmount:' + props.tag);
		},
		[],
		Symbol.for('dips.leaf.effect'),
	);
	return createElement('span', { class: 'leaf', children: props.tag });
}

function App() {
	const [on, setOn] = useState<any>(true, Symbol.for('dips.on'));
	setOnFn = setOn;
	return createElement('div', {
		id: 'host',
		children: [
			createElement(Leaf, { tag: 'A' }), // unconditional sibling keeps Blocks mode
			on === true ? createElement(Leaf, { tag: 'B' }) : on, // component ⟷ null/text
		],
	});
}

describe('de-opt item path switching (component ⟷ null/text at a stable index)', () => {
	it('component → null removes the DOM and runs the unmount cleanup; round-trips', () => {
		const r = mount(App as any);
		flushEffects();
		const text = () => r.container.querySelector('#host')!.textContent;
		expect(text()).toBe('AB');
		expect(log).toEqual(['mount:A', 'mount:B']);

		flushSync(() => setOnFn!(null));
		flushEffects();
		expect(text()).toBe('A');
		expect(log).toEqual(['mount:A', 'mount:B', 'unmount:B']);

		flushSync(() => setOnFn!(true));
		flushEffects();
		expect(text()).toBe('AB');
		expect(log).toEqual(['mount:A', 'mount:B', 'unmount:B', 'mount:B']);
		r.unmount();
	});

	it('component → text → component (pure path residue cleared on the way back)', () => {
		log.length = 0;
		const r = mount(App as any);
		flushEffects();
		const text = () => r.container.querySelector('#host')!.textContent;
		expect(text()).toBe('AB');

		flushSync(() => setOnFn!('t'));
		flushEffects();
		expect(text()).toBe('At'); // component gone, text rendered

		flushSync(() => setOnFn!(true));
		flushEffects();
		expect(text()).toBe('AB'); // text residue cleared, component back
		r.unmount();
	});
});
