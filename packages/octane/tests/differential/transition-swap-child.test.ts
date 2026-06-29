import { describe, it } from 'vitest';
import { mountDifferential } from './_rig.js';
import { resolve } from 'node:path';

const FIXTURE = resolve(__dirname, '../_fixtures/transition-swap-child.tsrx');

function deferred<T>() {
	let resolve!: (v: T) => void;
	const promise = new Promise<T>((res) => (resolve = res));
	return { promise, resolve };
}

describe('differential: transition-swap-child.tsrx — childSlot replace-suspend holds prior content', () => {
	it('holds A while a transition swaps in a suspending B (childSlot), then commits B', async () => {
		const d = deferred<number>();
		const r = await mountDifferential(FIXTURE, 'SwapChild', { promise: d.promise });
		await r.step('mount: A shown, idle', () => {});
		await r.step('start transition (B suspends; not resolved) — old held', async (i, rr) => {
			await i.click('#go');
			await rr.click('#go');
		});
		await r.step('resolve: B-2 shown, idle', async () => {
			d.resolve(2);
			for (let k = 0; k < 5; k++) await Promise.resolve();
		});
		r.unmount();
	});
});
