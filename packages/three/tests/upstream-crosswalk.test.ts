import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { describe, it } from 'vitest';

describe('@octanejs/three pinned upstream crosswalk', () => {
	// @parity-case adapted:three-upstream-crosswalk
	it('classifies all 90 exports and 157 tests with no missing evidence targets', () => {
		execFileSync(
			process.execPath,
			[resolve(__dirname, '../scripts/check-upstream-crosswalk.mjs')],
			{
				stdio: 'pipe',
			},
		);
	});
});
