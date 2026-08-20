// Jest 30 removed the alias matchers (toBeCalled, toBeCalledTimes) that the
// pinned framer-motion@12.42.2 suite still uses; upstream runs an older Jest.
// This harness-owned compat file restores exactly the aliases the pinned
// suite calls, delegating to the canonical matchers.
expect.extend({
	toBeCalled(received) {
		const pass = received.mock ? received.mock.calls.length > 0 : false;
		return {
			pass,
			message: () => `expected mock function ${pass ? 'not ' : ''}to have been called`,
		};
	},
	toBeCalledTimes(received, times) {
		const pass = received.mock ? received.mock.calls.length === times : false;
		return {
			pass,
			message: () =>
				`expected mock function to have been called ${times} times, got ${received.mock?.calls.length ?? 'no mock'}`,
		};
	},
});
