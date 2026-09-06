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
		// The pinned JsonReporter emits modules in this order but omits their
		// project. Preserve it so one file can run in both DOM and browser lanes.
		this.moduleProjects = testModules.map((module) => ({
			file: module.task.filepath,
			projectName: module.project._parent?.name ?? module.project.name,
		}));
		for (const testModule of testModules) repairTaskErrors(testModule.task);
		return super.onTestRunEnd(testModules, ...rest);
	}

	writeReport(report) {
		const result = JSON.parse(report);
		if (result.testResults.length !== this.moduleProjects.length)
			throw new Error('Vitest JSON report lost its project identity mapping');
		for (const [index, suite] of result.testResults.entries()) {
			const module = this.moduleProjects[index];
			if (suite.name !== module.file)
				throw new Error('Vitest JSON report reordered its project identity mapping');
			suite.projectName = module.projectName;
		}
		return super.writeReport(JSON.stringify(result));
	}
}
