import { SYMBOLS } from '../../kernel/ui.js';
import { CATEGORIES } from './registry.js';

/**
 * @typedef {Object} Finding
 * @property {import('./check.js').Check} check
 * @property {import('./check.js').CheckResult} result
 * @property {import('./check.js').FixOutcome} [fixed]
 */

/**
 * A check reports what it found; its severity decides how much that counts.
 * Everything downstream (glyph, summary, exit code) reads this one function, so
 * the report can never show a red mark next to a count that calls it a warning.
 *
 * @param {Finding} finding
 * @returns {'pass' | 'fail' | 'warn' | 'skip'}
 */
export function level({ check, result }) {
	if (result.status === 'pass' || result.status === 'skip') return result.status;
	return result.status === 'fail' && check.severity === 'error' ? 'fail' : 'warn';
}

/**
 * @param {Finding[]} findings
 * @returns {{ pass: number, fail: number, warn: number, skip: number }}
 */
export function summarize(findings) {
	const totals = { pass: 0, fail: 0, warn: 0, skip: 0 };
	for (const finding of findings) totals[level(finding)]++;
	return totals;
}

/**
 * Only an `error`-severity finding makes the run itself unsuccessful. Warnings
 * are advice, and a `skip` means the check did not apply.
 *
 * @param {Finding[]} findings
 * @returns {boolean}
 */
export function hasErrors(findings) {
	return findings.some((finding) => level(finding) === 'fail');
}

/**
 * A finding is worth repairing when it reported a problem and its check knows
 * how to fix it.
 *
 * @param {Finding} finding
 * @returns {boolean}
 */
export function isRepairable(finding) {
	return (
		(finding.result.status === 'fail' || finding.result.status === 'warn') &&
		Boolean(finding.check.fix)
	);
}

/**
 * @param {import('../../kernel/ui.js').Ui} ui
 * @param {Finding} finding
 * @returns {string}
 */
function glyph(ui, finding) {
	const { colors } = ui;
	switch (level(finding)) {
		case 'pass':
			return colors.green(SYMBOLS.pass);
		case 'skip':
			return colors.dim(SYMBOLS.skip);
		case 'warn':
			return colors.yellow(SYMBOLS.warn);
		default:
			return colors.red(SYMBOLS.fail);
	}
}

/**
 * @param {import('../../kernel/context.js').Ctx} ctx
 * @param {Finding[]} findings
 */
export function renderFindings(ctx, findings) {
	const { ui } = ctx;
	const visible = ctx.verbose ? findings : findings.filter((f) => f.result.status !== 'skip');
	const width = visible.reduce((max, f) => Math.max(max, f.check.title.length), 0);

	for (const category of CATEGORIES) {
		const group = visible.filter((f) => f.check.category === category);
		if (group.length === 0) continue;

		ui.log('');
		ui.log(ui.colors.bold(category));

		for (const finding of group) {
			const { check, result, fixed } = finding;
			const title = check.title.padEnd(width);
			ui.log(`  ${glyph(ui, finding)} ${title}  ${ui.colors.dim(result.message)}`);

			if (result.status !== 'pass' && result.status !== 'skip') {
				for (const line of result.detail ?? []) ui.log(`      ${ui.colors.dim(line)}`);
			}
			if (fixed?.changed) ui.log(`      ${ui.colors.green(`fixed: ${fixed.message}`)}`);
			else if (fixed) ui.log(`      ${ui.colors.yellow(fixed.message)}`);
		}
	}
}

/**
 * @param {import('../../kernel/context.js').Ctx} ctx
 * @param {Finding[]} findings
 */
export function renderSummary(ctx, findings) {
	const { colors } = ctx.ui;
	const totals = summarize(findings);
	/** @type {string[]} */
	const parts = [];

	if (totals.fail > 0) parts.push(colors.red(`${totals.fail} failing`));
	if (totals.warn > 0)
		parts.push(colors.yellow(`${totals.warn} warning${totals.warn === 1 ? '' : 's'}`));
	parts.push(colors.green(`${totals.pass} passing`));
	if (totals.skip > 0 && ctx.verbose) parts.push(colors.dim(`${totals.skip} skipped`));

	ctx.ui.log('');
	ctx.ui.log(parts.join(colors.dim(' · ')));

	const fixable = findings.filter((finding) => isRepairable(finding) && !finding.fixed);
	if (fixable.length > 0) {
		const noun = fixable.length === 1 ? 'finding' : 'findings';
		ctx.ui.log(colors.dim(`\`octane doctor --fix\` can repair ${fixable.length} ${noun}.`));
	}
}

/**
 * @param {Finding[]} findings
 * @param {Record<string, unknown>} project
 * @returns {Record<string, unknown>}
 */
export function toJson(findings, project) {
	return {
		ok: !hasErrors(findings),
		summary: summarize(findings),
		project,
		checks: findings.map(({ check, result, fixed }) => ({
			id: check.id,
			title: check.title,
			category: check.category,
			severity: check.severity,
			status: result.status,
			message: result.message,
			detail: result.detail ?? [],
			fixable: Boolean(check.fix),
			...(fixed
				? { fixed: { changed: fixed.changed, message: fixed.message, files: fixed.files ?? [] } }
				: {}),
		})),
	};
}
