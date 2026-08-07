/**
 * Negative controls for the tape adapter.
 *
 * The adapter is what lets upstream's byte-exact util specs run here, so if it
 * silently swallowed failures the pristine and adapted lanes would report green
 * against broken code. Each case proves the corresponding tape assertion still
 * fails when its claim is false.
 */
import { describe, expect, it } from 'vitest';
import { createTapeAssert, runTapeCase, type TapeAssert } from '../_harness/tape-adapter';

function claimFails(claim: (t: TapeAssert) => void): unknown {
	const t = createTapeAssert({ assertions: 0 });
	try {
		claim(t);
	} catch (error) {
		return error;
	}
	return null;
}

describe('tape adapter', () => {
	const falseClaims: [string, (t: TapeAssert) => void][] = [
		['ok', (t) => t.ok(false)],
		['notOk', (t) => t.notOk(true)],
		['is', (t) => t.is(1, 2)],
		['not', (t) => t.not(1, 1)],
		['equal', (t) => t.equal('a', 'b')],
		['notEqual', (t) => t.notEqual('a', 'a')],
		['deepEqual', (t) => t.deepEqual({ a: 1 }, { a: 2 })],
		['notDeepEqual', (t) => t.notDeepEqual({ a: 1 }, { a: 1 })],
		['throws', (t) => t.throws(() => undefined)],
		[
			'doesNotThrow',
			(t) =>
				t.doesNotThrow(() => {
					throw new Error('boom');
				}),
		],
		['fail', (t) => t.fail()],
	];

	for (const [name, claim] of falseClaims) {
		it(`fails the case when t.${name} is given a false claim`, () => {
			expect(claimFails(claim), `t.${name} did not fail`).toBeTruthy();
		});
	}

	it('counts every assertion a passing case makes', async () => {
		const assertions = await runTapeCase('probe', (t) => {
			t.ok(1);
			t.is('a', 'a');
			t.deepEqual({ a: 1 }, { a: 1 });
			t.end();
		});
		expect(assertions).toBe(3);
	});

	// An upstream case that stops asserting anything — because a rename made its
	// import undefined, say — must not read as a pass.
	it('fails a case that performs no assertions', async () => {
		await expect(runTapeCase('empty', () => {})).rejects.toThrow(/performed no assertions/);
	});
});
