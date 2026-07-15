import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { describe, it } from 'vitest';

describe('@octanejs/visx public TypeScript export parity', () => {
	it('pins every released and current-master value and type-only export in both directions', () => {
		execFileSync(
			process.execPath,
			[resolve(import.meta.dirname, '../../scripts/check-public-types.mjs')],
			{
				stdio: 'pipe',
			},
		);
	});
});
