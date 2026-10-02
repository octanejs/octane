// This pilot classifies one resource-lifetime mutation; it is not a coverage inventory.
export const signalsMutations = [
	{
		id: 'iterator-not-closed',
		project: 'octane-signals-node',
		file: 'packages/octane/src/signals/requests.ts',
		find: 'const result = untrackCommitted(() => signalBatch(() => iterator.return?.()));',
		replace: 'const result = undefined;',
		testFile: 'packages/octane/tests/signals-streams.test.ts',
		tests: ['yield', 'reject', 'end'].map(
			(completion) =>
				`scoped stream resources > closes a replaced stream and ignores its late ${completion}`,
		),
	},
];
