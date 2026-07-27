// A green test must also mean "nothing threw".
//
// Octane reports an exception raised inside an effect through `console.error`
// WITHOUT failing the test, so a broken hook can sit behind passing DOM
// assertions indefinitely — that is exactly how a per-render TypeError in
// Group's useValue survived six runs of a fully green suite. This guard lives in
// setupFiles rather than in one test file so hydration, SSR and differential
// runs are covered too, not just the behavioural suite.
//
// A test that deliberately asserts on reported output calls
// `consoleErrorCalls()` to read it and `clearConsoleErrors()` to acknowledge it.
import { afterEach, beforeEach, vi } from 'vitest';

let spy: ReturnType<typeof vi.spyOn> | undefined;

export function consoleErrorCalls(): string[] {
	return (spy?.mock.calls ?? []).map((call) => String(call[0]));
}

export function clearConsoleErrors(): void {
	spy?.mockClear();
}

beforeEach(() => {
	spy = vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
	const calls = consoleErrorCalls();
	spy?.mockRestore();
	spy = undefined;
	if (calls.length > 0) {
		throw new Error(`Unexpected console.error during test:\n${calls.join('\n')}`);
	}
});
