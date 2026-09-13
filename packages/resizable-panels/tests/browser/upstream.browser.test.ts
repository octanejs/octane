import { describe, expect, test } from 'vitest';
import { runUpstreamBrowserSuite } from './upstream-runner.mjs';

describe('pinned Resizable Panels browser scenarios', () => {
	for (const mode of ['react', 'octane'] as const) {
		test(`pinned decoder scenarios and popup windows: ${mode}`, async () => {
			const result = await runUpstreamBrowserSuite({ mode });
			expect(result.failed, result.diagnostics).toEqual([]);
			expect(result.skipped).toEqual([]);
			expect(result.passed).toHaveLength(126);
		}, 240_000);
	}
});
