import { expect, it } from 'vitest';
import * as Binding from '@octanejs/motion';
import * as Engine from 'motion';

it('preserves every runtime export from the upstream DOM engine', () => {
	const exports = Object.entries(Engine);
	expect(exports.length).toBeGreaterThan(0);
	for (const [name, value] of exports) {
		expect((Binding as Record<string, unknown>)[name], name).toBe(value);
	}
});
