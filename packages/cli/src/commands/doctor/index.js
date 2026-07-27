import { defineCommand } from '../../kernel/command.js';
import { EXIT, usageError } from '../../kernel/errors.js';
import { summarizeProject } from '../../kernel/project.js';
import { fail, skip } from './check.js';
import { CATEGORIES, CHECKS } from './registry.js';
import { hasErrors, isRepairable, renderFindings, renderSummary, toJson } from './report.js';

/**
 * @param {import('../../kernel/context.js').Ctx} ctx
 * @param {import('../../kernel/project.js').Project} project
 * @param {import('./check.js').Check} check
 * @returns {Promise<import('./check.js').CheckResult>}
 */
async function runCheck(ctx, project, check) {
	if (check.applies && !check.applies(project)) return skip('Does not apply to this project');
	try {
		return await check.run(ctx, project);
	} catch (error) {
		// One broken check must not hide the other twenty.
		return fail(`Check failed to run: ${error instanceof Error ? error.message : String(error)}`);
	}
}

export default defineCommand({
	description:
		'Inspect the project for the configuration and dependency mistakes that break Octane\n' +
		'quietly: a duplicated runtime, a missing JSX source, plain tsc over .tsrx.',
	flags: {
		fix: { type: 'boolean', description: 'Apply the repairs that are mechanical and unambiguous.' },
		only: {
			type: 'string',
			repeatable: true,
			placeholder: '<id>',
			description: 'Run a single check by id. Repeatable.',
		},
		category: {
			type: 'string',
			placeholder: '<name>',
			choices: CATEGORIES,
			description: 'Run only one category of checks.',
		},
	},

	async run(ctx, input) {
		const selected = CHECKS.filter((check) => {
			if (input.flags.category && check.category !== input.flags.category) return false;
			if (input.flags.only?.length > 0 && !input.flags.only.includes(check.id)) return false;
			return true;
		});

		if (selected.length === 0) {
			throw usageError('No checks matched.', 'Run `octane doctor --help` to see the filters.');
		}

		const project = ctx.project();
		ctx.ui.intro('octane doctor');

		const spinner = ctx.ui.spinner(`Checking ${project.root}`);
		/** @type {import('./report.js').Finding[]} */
		const findings = [];
		for (const check of selected) {
			findings.push({ check, result: await runCheck(ctx, project, check) });
		}
		spinner.stop(`Ran ${selected.length} check(s)`);

		if (input.flags.fix) await applyFixes(ctx, project, findings);

		renderFindings(ctx, findings);
		renderSummary(ctx, findings);

		return {
			exitCode: hasErrors(findings) ? EXIT.DIAGNOSTIC : EXIT.OK,
			json: toJson(findings, summarizeProject(project)),
		};
	},
});

/**
 * Repair what can be repaired, then re-run those checks so the report shows the
 * state after the edit rather than the state that prompted it.
 *
 * @param {import('../../kernel/context.js').Ctx} ctx
 * @param {import('../../kernel/project.js').Project} project
 * @param {import('./report.js').Finding[]} findings
 */
async function applyFixes(ctx, project, findings) {
	const repairable = findings.filter(isRepairable);
	if (repairable.length === 0) return;

	if (ctx.dryRun) {
		for (const finding of repairable) {
			finding.fixed = { changed: false, message: 'would be fixed (--dry-run)' };
		}
		return;
	}

	const confirmed = await ctx.ui.confirm({
		message: `Apply ${repairable.length} fix(es) to this project?`,
		flag: '--yes',
		initial: true,
	});
	if (!confirmed) return;

	for (const finding of repairable) {
		const fix = /** @type {NonNullable<typeof finding.check.fix>} */ (finding.check.fix);
		try {
			finding.fixed = await fix(ctx, project);
		} catch (error) {
			finding.fixed = {
				changed: false,
				message: `fix failed: ${error instanceof Error ? error.message : String(error)}`,
			};
		}
		if (finding.fixed.changed) {
			finding.result = await runCheck(ctx, ctx.refreshProject(), finding.check);
		}
	}
}
