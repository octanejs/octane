import { describe, it, expect } from 'vitest';
import { mount, flushEffects } from './_helpers';
import { createElement, createPortal, flushSync, useState } from '../src/index.js';

// Regression: the raw de-opt reconciler assumed FULL ownership of its element's live
// children — a createPortal targeting an octane-managed de-opt host had its whole
// `<!--portal-->…<!--/portal-->` range removed on the owner's next re-render
// (real-world: Radix Toast portals each toast <li> into the viewport <ol>; every
// provider re-render deleted all toasts). Portal ranges are now tagged and skipped:
// they coexist with the container's rendered children, exactly like React portals.
let setTargetFn: ((el: HTMLElement | null) => void) | null = null;
let bumpFn: (() => void) | null = null;

function Host() {
	const [target, setTarget] = useState<HTMLElement | null>(null, Symbol.for('pidh.target'));
	const [n, bump] = useState(0, Symbol.for('pidh.n'));
	setTargetFn = setTarget;
	bumpFn = () => bump((x) => x + 1);
	return createElement('div', {
		children: [
			createElement('ol', {
				key: 'list',
				id: 'list',
				'data-n': n,
				ref: setTarget,
				// The container ALSO renders its own children, which must keep
				// reconciling around the foreign portal range.
				children: createElement('li', { id: 'own', children: 'own-' + n }),
			}),
			target ? createPortal(createElement('li', { id: 'toast', children: 'hi' }), target) : null,
		],
	});
}

describe('createPortal into a de-opt-managed host', () => {
	it('portal content survives the owner re-rendering, alongside the owner children', async () => {
		const r = mount(Host as any);
		flushEffects();
		await new Promise((res) => setTimeout(res, 10));
		flushSync(() => {});
		const list = () => r.container.querySelector('#list')!;
		expect(list().querySelector('#toast')).not.toBe(null);
		expect(list().querySelector('#own')!.textContent).toBe('own-0');

		flushSync(() => bumpFn!());
		flushEffects();
		// The owner's own children updated; the foreign portal range is untouched.
		expect(list().getAttribute('data-n')).toBe('1');
		expect(list().querySelector('#own')!.textContent).toBe('own-1');
		expect(list().querySelector('#toast')).not.toBe(null);
		expect(list().querySelector('#toast')!.textContent).toBe('hi');
		r.unmount();
	});
});
