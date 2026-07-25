import { describe, expect, it } from 'vitest';
import { mount } from './_helpers';
import { App } from './_fixtures/counter.tsrx'; // any existing minimal fixture

// In a NON-profile build the runtime must never touch the devtools hook, so the
// global is never installed. This proves the __OCTANE_PROFILE_ENABLED__ gate.
describe('devtools hook is absent without the profile flag', () => {
	it('does not install globalThis.__OCTANE_DEVTOOLS__ on mount', () => {
		const { unmount } = mount(App);
		expect((globalThis as any).__OCTANE_DEVTOOLS__).toBeUndefined();
		unmount();
	});
});
