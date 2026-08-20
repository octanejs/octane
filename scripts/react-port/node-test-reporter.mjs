const TEST_EVENTS = new Set(['test:pass', 'test:fail']);

export default async function* reactPortNodeTestReporter(source) {
	const report = {
		schemaVersion: 1,
		runner: 'node-test',
		numPassedTests: 0,
		numFailedTests: 0,
		numPendingTests: 0,
		numTodoTests: 0,
		testResults: [],
	};
	const files = new Set();

	for await (const event of source) {
		if (typeof event?.data?.file === 'string') files.add(event.data.file);
		if (!TEST_EVENTS.has(event?.type) || event.data?.details?.type === 'suite') continue;
		if (event.data?.todo) report.numTodoTests += 1;
		else if (event.data?.skip) report.numPendingTests += 1;
		else if (event.type === 'test:fail') report.numFailedTests += 1;
		else report.numPassedTests += 1;
	}

	report.testResults = [...files].sort().map((name) => ({ name }));
	yield JSON.stringify(report);
}
