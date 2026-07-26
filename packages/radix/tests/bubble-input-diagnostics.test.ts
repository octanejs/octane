import { describe, expect, it, vi } from 'vitest';
import { drainPassiveEffects, flushSync } from 'octane';
import { mount } from '../../octane/tests/_helpers';
import { ControlledCheckbox } from './_fixtures/diagnostics.tsx';

async function settle() {
	drainPassiveEffects();
	flushSync(() => {});
	await new Promise((r) => setTimeout(r, 0));
	drainPassiveEffects();
	flushSync(() => {});
}

describe('bubble-input diagnostics', () => {
	it('controlled checkbox renders without the checked-without-handler warning', async () => {
		const error = vi.spyOn(console, 'error').mockImplementation(() => {});
		const r = mount(ControlledCheckbox);
		await settle();
		const offending = error.mock.calls.filter((c) => String(c[0]).includes('checked'));
		expect(offending).toEqual([]);
		r.unmount();
		error.mockRestore();
	});
});
