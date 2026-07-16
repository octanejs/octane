import { describe, expect, it } from 'vitest';
import * as binding from '@octanejs/dexie';

describe('@octanejs/dexie exports', () => {
	it('contains every runtime export from dexie-react-hooks', async () => {
		const upstream = await import('dexie-react-hooks');
		for (const name of Object.keys(upstream)) {
			expect(name in binding, `missing export: ${name}`).toBe(true);
		}
	});

	it('retains Dexie core and default exports', () => {
		expect(binding.Dexie).toBeTypeOf('function');
		expect(binding.default).toBe(binding.Dexie);
		expect(binding.liveQuery).toBeTypeOf('function');
		expect(binding.useLiveQuery).toBeTypeOf('function');
	});
});
