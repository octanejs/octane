import assert from 'node:assert/strict';
import test from 'node:test';
import { measureServerComponentFrames } from './ssr-component-frames.mjs';

test('SSR component frames initialize optional identity without later recipe writes', async (t) => {
	for (const dev of [false, true]) {
		for (const potential of [false, true]) {
			const result = await measureServerComponentFrames({ dev, potential });
			assert.equal(result.work.frames, 200);
			assert.equal(
				result.work.envelopes,
				200,
				'Context restoration remains an independent allocation.',
			);
			assert.equal(
				result.work.recipeWrites,
				0,
				'Lazy identity fields belong to the initial frame shape.',
			);
			assert.equal(result.work.recipes, potential ? 200 : 0);
			assert.deepEqual([...new Set(result.work.widths)], [potential ? 14 : 9]);
			assert.equal(result.cacheAppends, 0, 'A first handle must update an existing cache slot.');
			if (potential) assert.ok(result.cacheWrites > 0);
			t.diagnostic(JSON.stringify(result));
		}
	}
});

test('SSR frame work observation restores an existing global descriptor', async () => {
	const original = Object.getOwnPropertyDescriptor(globalThis, '__serverFrameWork');
	const value = { enclosingObserver: true };
	Object.defineProperty(globalThis, '__serverFrameWork', {
		configurable: true,
		enumerable: false,
		get: () => value,
	});
	const expected = Object.getOwnPropertyDescriptor(globalThis, '__serverFrameWork');
	try {
		await measureServerComponentFrames({ rows: 2 });
		assert.deepEqual(Object.getOwnPropertyDescriptor(globalThis, '__serverFrameWork'), expected);
	} finally {
		if (original) Object.defineProperty(globalThis, '__serverFrameWork', original);
		else delete globalThis.__serverFrameWork;
	}
});
