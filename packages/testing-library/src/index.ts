// Default entry — `pure` plus RTL's test-framework side effects:
//
//  1. auto-`cleanup()` after each test when the runner exposes a global
//     `afterEach` (or `teardown`), opt-out via RTL_SKIP_AUTO_CLEANUP;
//  2. octane's act()-environment warning armed for the whole run when global
//     `beforeAll`/`afterAll` exist (mirrors RTL flipping IS_REACT_ACT_ENVIRONMENT).
//
// NOTE: with `globals: false` runners (this repo's vitest config) none of these
// globals exist, so both registrations are no-ops — register `afterEach(cleanup)`
// yourself, exactly like importing `@testing-library/react/pure`.
import { cleanup } from './pure';
import { getIsOctaneActEnvironment, setOctaneActEnvironment } from './act-environment';

type TestHook = (callback: () => void) => void;
const globals = globalThis as {
	afterEach?: TestHook;
	teardown?: TestHook;
	beforeAll?: TestHook;
	afterAll?: TestHook;
};

if (typeof process === 'undefined' || !process.env?.RTL_SKIP_AUTO_CLEANUP) {
	if (typeof globals.afterEach === 'function') {
		globals.afterEach(() => {
			cleanup();
		});
	} else if (typeof globals.teardown === 'function') {
		globals.teardown(() => {
			cleanup();
		});
	}

	if (typeof globals.beforeAll === 'function' && typeof globals.afterAll === 'function') {
		let previousIsActEnvironment = getIsOctaneActEnvironment();
		globals.beforeAll(() => {
			previousIsActEnvironment = getIsOctaneActEnvironment();
			setOctaneActEnvironment(true);
		});
		globals.afterAll(() => {
			setOctaneActEnvironment(previousIsActEnvironment);
		});
	}
}

export * from './pure';
