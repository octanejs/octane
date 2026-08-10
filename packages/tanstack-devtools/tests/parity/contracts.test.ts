import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(import.meta.dirname, '../../../..');
const crosswalk = JSON.parse(
	readFileSync(resolve(root, 'packages/tanstack-devtools/audit/upstream-crosswalk.json'), 'utf8'),
);
const upstreamIndex = readFileSync(
	resolve(root, 'packages/tanstack-devtools/upstream/package/src/index.ts'),
	'utf8',
);

describe('@octanejs/tanstack-devtools parity audit contracts', () => {
	it('authenticates the complete adapter and absent runtime suite', () => {
		expect(() =>
			execFileSync(
				process.execPath,
				['packages/tanstack-devtools/scripts/check-upstream-ledger.mjs'],
				{ cwd: root, stdio: 'pipe' },
			),
		).not.toThrow();
	});

	it('requires a disposition row for every pinned public upstream export', () => {
		const declared = new Set(
			(crosswalk.exports as Array<{ name: string }>).map((entry) => entry.name),
		);
		for (const name of [
			'TanStackDevtools',
			'TanStackDevtoolsReactPlugin',
			'TanStackDevtoolsReactInit',
		]) {
			expect(upstreamIndex).toContain(name);
			expect(declared.has(name)).toBe(true);
		}
		expect(crosswalk.exports).toHaveLength(3);
		for (const entry of crosswalk.exports as Array<{
			name: string;
			disposition: string;
			evidence: string;
			octaneExport: string;
		}>) {
			expect(entry.disposition.length).toBeGreaterThan(0);
			expect(entry.evidence.length).toBeGreaterThan(0);
			expect(entry.octaneExport.length).toBeGreaterThan(0);
		}
	});
});
