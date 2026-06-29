import { describe, it, expect } from 'vitest';
import { mount, flushEffects } from './_helpers';
import { SwapPortal } from './_fixtures/transition-swap-portal.tsrx';

function deferred<T>() {
	let resolve!: (v: T) => void;
	const promise = new Promise<T>((res) => (resolve = res));
	return { promise, resolve };
}

describe('off-screen swap — portal inside the suspending WIP must not orphan', () => {
	it('holds A, does NOT leave the portal in the target while suspended, commits on resolve', async () => {
		const target = document.createElement('div');
		document.body.appendChild(target);
		const d = deferred<number>();
		const r = mount(SwapPortal as any, { promise: d.promise, target });

		expect(r.find('#content').textContent).toBe('A');

		// Transition-swap to BPortal (renders a portal, then suspends). Old A must hold,
		// and the portal must NOT be orphaned in the target during the suspend.
		r.click('#go');
		const tick = () => new Promise((res) => setTimeout(res, 0));
		for (let i = 0; i < 4; i++) await tick();
		expect(r.find('#content').textContent).toBe('A'); // old held
		expect(target.querySelector('#ported')).toBe(null); // portal NOT orphaned

		// Resolve → B commits with its portal.
		d.resolve(2);
		for (let i = 0; i < 6; i++) await tick();
		flushEffects();
		expect(r.findAll('#content').length).toBe(1);
		expect(target.querySelector('#ported')).not.toBe(null); // portal now committed
		r.unmount();
		expect(target.querySelector('#ported')).toBe(null); // cleaned on unmount
		target.remove();
	});
});
