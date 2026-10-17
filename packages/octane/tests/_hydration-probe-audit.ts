// Test-only hydration probe audit (#2028). With OCTANE_HYDRATION_PROBE_AUDIT set
// to a file path, every place a development runtime probes the server DOM for a
// range, or adopts server nodes outside a range of their own, is counted per
// call site and test file and appended to that file as JSON lines when each test
// file finishes. The runtime reports through auditHydrationProbe (runtime.ts).
// scripts/hydration-probe-audit.mjs sums them by family against its budgets.
import { appendFileSync } from 'node:fs';
import { afterAll, expect } from 'vitest';

const out = process.env.OCTANE_HYDRATION_PROBE_AUDIT!;
const counts = new Map<string, number>();
let file = '';

// `at Class.method (path:line:col)`, `at fn [as alias] (path:line:col)` or
// `at fn (path:line:col)`.
const FRAME = /^\s*at (?:async )?([^\s(]+)(?: \[as [^\]]+\])? \(/;

(globalThis as any).__OCTANE_HYDRATION_PROBE_AUDIT__ = (kind: string, hit: boolean): void => {
	const frames = (new Error().stack ?? '').split('\n').slice(1);
	const names: string[] = [];
	for (const frame of frames) {
		const name = FRAME.exec(frame)?.[1];
		if (name !== undefined) names.push(name);
	}
	// names[0] is this reporter, [1] auditHydrationProbe, [2] the probing site.
	const site = names[2] ?? '?';
	const caller = names[3] ?? '?';
	file ||= expect.getState().testPath ?? '';
	const key = JSON.stringify([kind, hit, site, caller]);
	counts.set(key, (counts.get(key) ?? 0) + 1);
};

afterAll(() => {
	if (counts.size === 0) return;
	const records = [...counts].map(([key, count]) => {
		const [kind, hit, site, caller] = JSON.parse(key);
		return { kind, hit, site, caller, count };
	});
	appendFileSync(out, JSON.stringify({ file, records }) + '\n');
	counts.clear();
});
