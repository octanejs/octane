import { describe, it } from 'vitest';
import { mountDifferential } from './_rig.js';
import { resolve } from 'node:path';

const FIXTURE = resolve(__dirname, '../_fixtures/transition-swap-robust.tsrx');
function deferred<T>() {
	let resolve!: (v: T) => void;
	const promise = new Promise<T>((res) => (resolve = res));
	return { promise, resolve };
}

describe('differential: transition-swap robustness (React oracle)', () => {
	it('nested Suspense: inner boundary catches; outer commits B (does NOT hold A), then resolves', async () => {
		const d = deferred<number>();
		const r = await mountDifferential(FIXTURE, 'NestedSwap', { promise: d.promise });
		await r.step('mount: A', () => {});
		await r.step(
			'transition → inner @pending shown (inner boundary caught; A replaced)',
			async (i, rr) => {
				await i.click('#go');
				await rr.click('#go');
			},
		);
		await r.step('resolve → B-2', async () => {
			d.resolve(2);
			for (let k = 0; k < 5; k++) await Promise.resolve();
		});
		r.unmount();
	});
});
