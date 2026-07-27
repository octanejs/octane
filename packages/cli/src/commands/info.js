import { defineCommand } from '../kernel/command.js';
import { summarizeProject } from '../kernel/project.js';

/**
 * @param {unknown} value
 * @returns {string}
 */
function show(value) {
	if (value === null || value === undefined) return '-';
	if (Array.isArray(value)) return value.length === 0 ? '-' : String(value.length);
	return String(value);
}

export default defineCommand({
	description: 'Print the environment and project details worth pasting into a bug report.',

	async run(ctx) {
		const project = ctx.project();
		const summary = summarizeProject(project);

		const environment = {
			cli: ctx.version,
			node: process.versions.node,
			platform: `${process.platform} ${process.arch}`,
		};

		ctx.ui.note('Environment', [
			`CLI       ${environment.cli}`,
			`Node      ${environment.node}`,
			`Platform  ${environment.platform}`,
		]);

		ctx.ui.note('Project', [
			`Name      ${show(summary.name)}`,
			`Root      ${show(summary.root)}`,
			`Manager   ${show(summary.packageManager)}`,
			`Bundler   ${show(summary.bundler)}${summary.bundlerConfig ? ` (${summary.bundlerConfig})` : ''}`,
			`Octane    ${show(summary.octane)}`,
			`Config    ${show(summary.octaneConfig)}`,
			`tsconfig  ${show(summary.tsconfig)}`,
			`.tsrx     ${show(summary.tsrxFileCount)} file(s)`,
		]);

		const bindings = /** @type {{ name: string, version: string | null }[]} */ (summary.bindings);
		if (bindings.length > 0) {
			ctx.ui.note(
				'Bindings',
				bindings.map((binding) => `${binding.name}@${binding.version ?? 'not installed'}`),
			);
		}

		return { json: { environment, project: summary } };
	},
});
