import { describe, it } from 'vitest';
import { mountDifferential } from './_rig.js';
import { resolve } from 'node:path';

// Differential parity for the transition REPLACE-suspend hold (React as oracle).
// Per ReactSuspense-test.internal.js / ReactTransition-test.js: a transition that
// mounts a NEW suspending subtree keeps the PREVIOUS content on screen until ready.
// RED until octane's off-screen (WIP) swap lands; the rig asserts octane.innerHTML
// === react.innerHTML after each step, so it cannot be satisfied by softening.

const FIXTURE = resolve(__dirname, '../_fixtures/transition-swap-suspend.tsrx');

function deferred<T>() {
	let resolve!: (v: T) => void;
	const promise = new Promise<T>((res) => (resolve = res));
	return { promise, resolve };
}

describe('differential: transition-swap-suspend.tsrx — replace-suspend holds prior content', () => {
	it('holds A while a transition swaps in a suspending B, then commits B', async () => {
		const d = deferred<number>();
		const r = await mountDifferential(FIXTURE, 'SwapSuspend', { promise: d.promise });

		await r.step('mount: A shown, idle', () => {});

		await r.step(
			'start transition (B suspends; not resolved) — old content held',
			async (i, rr) => {
				await i.click('#go');
				await rr.click('#go');
			},
		);

		await r.step('resolve: B-2 shown, idle', async () => {
			d.resolve(2);
			// let both runtimes settle the resolved thenable
			for (let k = 0; k < 5; k++) await Promise.resolve();
		});

		r.unmount();
	});
});
