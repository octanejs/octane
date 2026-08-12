import { describe, it, expect } from 'vitest';
import { mount, nextPaint } from '../_helpers';
import { InitialOnly } from '../_fixtures/initial-only.tsrx';

describe('initial-only style materialization', function initialOnlySuite() {
	// @parity-case conformance:initial-only-no-style-materialization
	it('does not materialize inline styles for an initial target without animate', async function doesNotMaterializeInitialOnly() {
		const r = mount(InitialOnly);
		await nextPaint();
		const div = r.find('#box');
		// Documented divergence vs React Motion: Octane leaves the inline style unset.
		expect(div.style.opacity).toBe('');
		r.unmount();
	});
});
