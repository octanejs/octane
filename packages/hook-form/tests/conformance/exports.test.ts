// Export-surface parity pin: @octanejs/hook-form must provide EVERY runtime
// export of real react-hook-form@7.81.0 and nothing more. Any upstream export
// missing from the port (or accidental extra) fails here.
import { describe, expect, it } from 'vitest';
import * as hookForm from '@octanejs/hook-form';
import * as reactHookForm from 'react-hook-form';

describe('@octanejs/hook-form export surface', () => {
	it('provides EVERY runtime export of real react-hook-form', () => {
		const upstream = Object.keys(reactHookForm).sort();
		const port = new Set(Object.keys(hookForm));
		const missing = upstream.filter((name) => !port.has(name));
		expect(missing).toEqual([]);
	});

	it('exports nothing upstream keeps private (no accidental superset)', () => {
		const upstream = new Set(Object.keys(reactHookForm));
		const extras = Object.keys(hookForm)
			.filter((name) => !upstream.has(name))
			.sort();
		expect(extras).toEqual([]);
	});
});
