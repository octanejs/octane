import { JsonReporter } from 'vitest/node';

// Vitest's JSON reporter serializes each failure as `error.stack || error.message`.
// Errors built by @vitest/runner's makeTimeoutError carry the real message
// ("Test timed out in Nms…") only on `.message`: their `.stack` is the placeholder
// captured at `it()` registration, whose header line is "Error: STACK_TRACE_ERROR".
// Serializing that stack alone reports the placeholder and drops the actual
// failure, so ensure every error's stack embeds its message before the base
// reporter renders `failureMessages`.
const PLACEHOLDER_HEADER = 'Error: STACK_TRACE_ERROR';

export function ensureStackContainsMessage(error) {
	if (typeof error?.stack !== 'string' || typeof error.message !== 'string') return error;
	if (error.message === '' || error.stack.includes(error.message)) return error;
	const frames = error.stack.startsWith(PLACEHOLDER_HEADER)
		? error.stack.slice(PLACEHOLDER_HEADER.length)
		: `\n${error.stack}`;
	error.stack = `${error.name || 'Error'}: ${error.message}${frames}`;
	return error;
}

function repairTaskErrors(task) {
	task.result?.errors?.forEach(ensureStackContainsMessage);
	task.tasks?.forEach(repairTaskErrors);
}

export default class ReactParityJsonReporter extends JsonReporter {
	constructor(options = {}) {
		super(options);
	}

	onTestRunEnd(testModules, ...rest) {
		for (const testModule of testModules) repairTaskErrors(testModule.task);
		return super.onTestRunEnd(testModules, ...rest);
	}
}
