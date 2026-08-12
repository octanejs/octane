import { execFileSync } from 'node:child_process';
import { describe, it } from 'vitest';

describe('@octanejs/aria pinned upstream crosswalk', () => {
	it('classifies all 1,294 exports and 185 upstream test artifacts', () => {
		execFileSync(process.execPath, ['packages/aria/scripts/check-upstream-crosswalk.mjs'], {
			cwd: process.cwd(),
			stdio: 'pipe',
		});
	});
});
