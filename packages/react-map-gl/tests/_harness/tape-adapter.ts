/**
 * Runs @vis.gl/react-mapbox's own `tape-promise/tape` suites, unmodified, under
 * Vitest.
 *
 * Upstream drives its tests with `ocular-test`, which this repository does not
 * have. Rather than rewrite the five framework-neutral util specs — which would
 * make them port-authored evidence rather than upstream evidence — this adapter
 * presents tape's assertion surface on top of Vitest so the spec FILES stay
 * byte-exact. Only the harness is ours.
 *
 * Every assertion maps to a real `expect`, so an upstream assertion that stops
 * holding fails the run. `tests/upstream-util/adapter.test.ts` is the negative
 * control proving that: it asserts each mapped method actually throws on a false
 * claim, so the adapter cannot degrade into a no-op that reports green.
 */
import { expect, it } from 'vitest';

export interface TapeAssert {
	ok(value: unknown, message?: string): void;
	notOk(value: unknown, message?: string): void;
	is(actual: unknown, expected: unknown, message?: string): void;
	not(actual: unknown, expected: unknown, message?: string): void;
	equal(actual: unknown, expected: unknown, message?: string): void;
	notEqual(actual: unknown, expected: unknown, message?: string): void;
	deepEqual(actual: unknown, expected: unknown, message?: string): void;
	notDeepEqual(actual: unknown, expected: unknown, message?: string): void;
	throws(fn: () => unknown, message?: string): void;
	doesNotThrow(fn: () => unknown, message?: string): void;
	fail(message?: string): void;
	pass(message?: string): void;
	end(): void;
	plan(count: number): void;
}

/** Counts every assertion the adapter performs, for the evidence inventory. */
export const assertionLog: { name: string; assertions: number }[] = [];

export function createTapeAssert(record: { assertions: number }): TapeAssert {
	const count = <T>(run: () => T): T => {
		record.assertions++;
		return run();
	};
	return {
		ok: (value, message) => count(() => expect(Boolean(value), message).toBe(true)),
		notOk: (value, message) => count(() => expect(Boolean(value), message).toBe(false)),
		is: (actual, expected, message) => count(() => expect(actual, message).toBe(expected)),
		not: (actual, expected, message) => count(() => expect(actual, message).not.toBe(expected)),
		equal: (actual, expected, message) => count(() => expect(actual, message).toBe(expected)),
		notEqual: (actual, expected, message) =>
			count(() => expect(actual, message).not.toBe(expected)),
		deepEqual: (actual, expected, message) =>
			count(() => expect(actual, message).toEqual(expected)),
		notDeepEqual: (actual, expected, message) =>
			count(() => expect(actual, message).not.toEqual(expected)),
		throws: (fn, message) => count(() => expect(fn, message).toThrow()),
		doesNotThrow: (fn, message) => count(() => expect(fn, message).not.toThrow()),
		fail: (message) => count(() => expect.unreachable(message ?? 't.fail()')),
		pass: () => count(() => expect(true).toBe(true)),
		// tape's bookkeeping calls have no Vitest equivalent and assert nothing.
		end: () => {},
		plan: () => {},
	};
}

type TapeCase = (t: TapeAssert) => void | Promise<void>;

/** The body of one tape case, without the Vitest registration around it. */
export async function runTapeCase(name: string, body: TapeCase): Promise<number> {
	const record = { name, assertions: 0 };
	assertionLog.push(record);
	await body(createTapeAssert(record));
	// A tape case that asserts nothing is a silently empty case; upstream's util
	// specs all assert, so treat zero as a harness failure rather than a pass.
	expect(record.assertions, `${name} performed no assertions`).toBeGreaterThan(0);
	return record.assertions;
}

/**
 * When collection is active, `test()` records the case instead of registering
 * it. The parity manifest requires every executable case to be declared and
 * annotated in a repository-owned file, and the upstream spec files are vendored
 * byte-exact — so the wrapper collects their cases and declares them itself.
 */
let collecting: Map<string, TapeCase> | null = null;

export function beginCollection(): Map<string, TapeCase> {
	collecting = new Map();
	return collecting;
}

export function endCollection(): void {
	collecting = null;
}

export default function test(name: string, body: TapeCase): void {
	if (collecting) {
		if (collecting.has(name)) throw new Error(`duplicate upstream case name: ${name}`);
		collecting.set(name, body);
		return;
	}
	it(name, () => runTapeCase(name, body));
}

/** Run one collected upstream case, failing if it was never collected. */
export function runCollected(collected: Map<string, TapeCase>, name: string): Promise<number> {
	const body = collected.get(name);
	if (!body) {
		throw new Error(
			`upstream case ${JSON.stringify(name)} was not collected — it was renamed or removed upstream`,
		);
	}
	return runTapeCase(name, body);
}
