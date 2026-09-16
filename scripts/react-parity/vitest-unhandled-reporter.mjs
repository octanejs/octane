import { ensureStackContainsMessage } from './vitest-json-reporter.mjs';

function formatUnhandledError(error, seen = new Set()) {
	if (seen.has(error)) return '[circular error cause]';
	seen.add(error);
	const message = formatError(error);
	return error?.cause == null
		? message
		: `${message}\nCaused by: ${formatUnhandledError(error.cause, seen)}`;
}

function formatError(error) {
	ensureStackContainsMessage(error);
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
