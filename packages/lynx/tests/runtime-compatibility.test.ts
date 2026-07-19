import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const LYNX_ROOT = resolve(import.meta.dirname, '..');
const REPOSITORY_ROOT = resolve(LYNX_ROOT, '../..');
const evidence = JSON.parse(
	readFileSync(resolve(LYNX_ROOT, 'audit/runtime-compatibility.json'), 'utf8'),
) as {
	selectedSdk: string;
	selectedRspeedy: string;
	runtimes: Record<string, { compileGraph: string }>;
	universalCoreBuiltins: {
		diagnosedApplicationGlobals: string[];
		documentedOrBaseline: string[];
		microtaskContract: string;
		symbolContract: string;
	};
};
const toolchain = JSON.parse(readFileSync(resolve(LYNX_ROOT, 'audit/toolchain.json'), 'utf8')) as {
	nativeSdk: { version: string };
	packages: Array<{ name: string; version: string }>;
};
const universalCore = readFileSync(
	resolve(REPOSITORY_ROOT, 'packages/octane/src/universal-core.ts'),
	'utf8',
);

describe('Lynx runtime compatibility evidence', () => {
	it('stays aligned with the immutable SDK and Rspeedy pins', () => {
		expect(evidence.selectedSdk).toBe(toolchain.nativeSdk.version);
		expect(evidence.selectedRspeedy).toBe(
			toolchain.packages.find((entry) => entry.name === '@lynx-js/rspeedy')?.version,
		);
		expect(Object.keys(evidence.runtimes)).toEqual(['main-thread', 'background']);
		expect(
			new Set(Object.values(evidence.runtimes).map((runtime) => runtime.compileGraph)),
		).toEqual(new Set(['packages/rspeedy-plugin-octane/tests/build.test.ts']));
	});

	it('records every non-baseline built-in used by the native universal core', () => {
		expect(universalCore).toContain('.flatMap(');
		expect(universalCore).toContain('.finally(');
		expect(universalCore).toContain('globalThis');
		expect(universalCore).not.toMatch(/\bqueueMicrotask\s*\(/);
		expect(universalCore).not.toMatch(
			/\b(?:FinalizationRegistry|structuredClone|WeakRef)\b|\.(?:toReversed|toSorted)\s*\(/,
		);
		expect(universalCore).toContain('.description');
		expect(evidence.universalCoreBuiltins.documentedOrBaseline).toEqual(
			expect.arrayContaining([
				'Array.prototype.flatMap',
				'globalThis',
				'Promise.prototype.finally',
				'Symbol.prototype.description',
			]),
		);
		expect(evidence.universalCoreBuiltins.microtaskContract).toMatch(/options\.scheduleMicrotask/);
		expect(evidence.universalCoreBuiltins.symbolContract).toMatch(/Symbol\.prototype\.description/);
		expect(evidence.universalCoreBuiltins.diagnosedApplicationGlobals).toEqual(
			expect.arrayContaining(['queueMicrotask', 'structuredClone']),
		);
	});
});
