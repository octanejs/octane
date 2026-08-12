function formatUnhandledError(error) {
	if (typeof error?.stack === 'string') return error.stack;
	if (typeof error?.message === 'string') return error.message;
	if (typeof error === 'string') return error;
	try {
		return JSON.stringify(error);
	} catch {
		return String(error);
	}
}

export default class ReactParityUnhandledReporter {
	onTestRunEnd(_testModules, unhandledErrors) {
		if (unhandledErrors.length === 0) return;
		console.error(`Vitest reported ${unhandledErrors.length} unhandled error(s):`);
		for (const error of unhandledErrors) console.error(formatUnhandledError(error));
	}
}
