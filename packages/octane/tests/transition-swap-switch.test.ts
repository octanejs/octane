import { describe, it, expect } from 'vitest';
import { mount, flushEffects } from './_helpers';
import { SwitchSwap } from './_fixtures/transition-swap-switch.tsrx';

function deferred<T>() {
	let resolve!: (v: T) => void;
	const promise = new Promise<T>((res) => (resolve = res));
	return { promise, resolve };
}

describe('off-screen swap — switchBlock replace-suspend holds prior case', () => {
	it('holds case-0 (A) while a transition swaps to a suspending case-1, then commits', async () => {
		const d = deferred<number>();
		const r = mount(SwitchSwap as any, { promise: d.promise });
		expect(r.find('#content').textContent).toBe('A');

		r.click('#go');
		const tick = () => new Promise((res) => setTimeout(res, 0));
		for (let i = 0; i < 4; i++) await tick();
		expect(r.find('#content').textContent).toBe('A'); // old case held
		expect(r.findAll('#fallback').length).toBe(0); // no fallback flash
		expect(r.find('#pending').textContent).toBe('pending');

		d.resolve(2);
		for (let i = 0; i < 6; i++) await tick();
		flushEffects();
		expect(r.find('#content').textContent).toBe('B-2');
		expect(r.find('#pending').textContent).toBe('idle');
		r.unmount();
	});
});
