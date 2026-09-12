import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, it } from 'vitest';
// @ts-expect-error shared ESM runner has no declaration emit
import { runBrowserSuite } from '../../../scripts/react-parity/tanstack-virtual-pristine-runtime.mjs';

function verifyBrowser(mode: 'pristine' | 'adapted', count: number) {
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

// @parity-case pristine:virtual-original-browser-suite
it('runs all 35 pinned Virtual browser cases unchanged against React', () => {
	verifyBrowser('pristine', 35);
}, 180_000);

// @parity-case adapted:virtual-browser-suite
it('runs all 35 adapted Virtual browser cases and both direct DOM prepend regressions', () => {
	verifyBrowser('adapted', 37);
}, 180_000);
