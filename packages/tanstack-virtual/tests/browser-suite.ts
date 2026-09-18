import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect } from 'vitest';
// @ts-expect-error shared ESM runner has no declaration emit
import { runBrowserSuite } from '../../../scripts/react-parity/tanstack-virtual-pristine-runtime.mjs';

export function verifyBrowser(mode: 'pristine' | 'adapted', count: number) {
	const expected = JSON.parse(
		readFileSync(resolve(import.meta.dirname, `../audit/${mode}-browser.json`), 'utf8'),
	).tests;
	const result = runBrowserSuite(mode);
	expect(result.status, result.stdout + result.stderr).toBe(0);
	expect(result.report.errors).toEqual([]);
	expect(result.report.stats).toMatchObject({
		expected: count,
		skipped: 0,
		unexpected: 0,
		flaky: 0,
	});
	expect(result.identities).toEqual(expected);
}
