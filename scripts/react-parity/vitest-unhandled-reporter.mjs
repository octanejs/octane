import { ensureStackContainsMessage } from './vitest-json-reporter.mjs';

function formatErrorSummary(error) {
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

function formatUnhandledError(error, seen = new Set()) {
	if (error !== null && typeof error === 'object') {
		if (seen.has(error)) return '[Circular error cause]';
		seen.add(error);
	}
	const summary = formatErrorSummary(error);
	return error?.cause === undefined
		? summary
		: `${summary}\nCaused by: ${formatUnhandledError(error.cause, seen)}`;
}

export default class ReactParityUnhandledReporter {
	onTestRunEnd(_testModules, unhandledErrors) {
		if (unhandledErrors.length === 0) return;
		console.error(`Vitest reported ${unhandledErrors.length} unhandled error(s):`);
		for (const error of unhandledErrors) console.error(formatUnhandledError(error));
	}
}
