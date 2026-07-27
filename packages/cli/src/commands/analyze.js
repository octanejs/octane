import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { defineCommand } from '../kernel/command.js';
import { CliError, EXIT } from '../kernel/errors.js';
import { SYMBOLS } from '../kernel/ui.js';

/**
 * @typedef {Object} Finding
 * @property {string} file relative to the project root
 * @property {number} line
 * @property {number} column 1-based, matching editor gutters
 * @property {'error' | 'warning'} severity
 * @property {string} code
 * @property {string} message
 * @property {string[]} suggestions
 */

/**
 * Load the project's own compiler.
 *
 * The diagnostics belong to the compiler, and it is the compiler in the
 * project's node_modules that decides what this project's code means. Shipping
 * a second copy in the CLI would report on a different version than the one
 * that builds the app.
 *
 * @param {string} root
 * @returns {Promise<(source: string, filename: string, options?: object) => { diagnostics: readonly any[] }>}
 */
async function loadCompiler(root) {
	const require = createRequire(path.join(root, 'noop.js'));
	let entry;
	try {
		entry = require.resolve('octane/compiler');
	} catch {
		throw new CliError('Could not resolve `octane/compiler` from this project.', {
			hint: 'Install the runtime first: pnpm add octane',
		});
	}
	const module = await import(pathToFileURL(entry).href);
	if (typeof module.compile !== 'function') {
		throw new CliError('The installed octane build exposes no compiler.');
	}
	return module.compile;
}

/**
 * Compiler suggestions are structured edits (a span plus the replacement), not
 * prose. Describe the ones whose shape is known and drop the rest, so the report
 * never prints `[object Object]`.
 *
 * @param {readonly any[] | undefined} suggestions
 * @returns {string[]}
 */
function describeSuggestions(suggestions) {
	const described = [];
	for (const suggestion of suggestions ?? []) {
		if (typeof suggestion === 'string') described.push(suggestion);
		else if (typeof suggestion?.message === 'string') described.push(suggestion.message);
		else if (typeof suggestion?.attribute === 'string') {
			const at = suggestion.start
				? ` at ${suggestion.start.line}:${suggestion.start.column + 1}`
				: '';
			described.push(`use \`${suggestion.attribute}\`${at}`);
		}
	}
	return described;
}

/**
 * Position appended by the compiler to a thrown message, e.g. `(App.tsrx:6:18)`.
 * Semantic errors carry their location this way rather than on `loc`.
 */
const TRAILING_LOCATION = /\s*\(([^()\s]+):(\d+):(\d+)\)\s*$/;

/**
 * Normalise a thrown compile failure into a finding.
 *
 * Two shapes reach here. A genuine parse failure carries a Babel-style `loc`.
 * A semantic failure (a slot-keyed hook in a plain JS loop, say) is thrown with
 * its position appended to the message instead, so recovering it keeps the
 * report pointing at the offending line rather than at 1:1.
 *
 * @param {unknown} error
 * @param {string} file
 * @param {string} [code] overrides the derived code, for a read failure
 * @returns {Finding}
 */
function thrownFailure(error, file, code) {
	const message = error instanceof Error ? error.message : String(error);
	const loc = /** @type {any} */ (error)?.loc;
	if (loc) {
		return {
			file,
			line: loc.line ?? 1,
			column: (loc.column ?? 0) + 1,
			severity: 'error',
			code: code ?? 'OCTANE_PARSE_ERROR',
			message,
			suggestions: [],
		};
	}

	const trailing = TRAILING_LOCATION.exec(message);
	return {
		file,
		line: trailing ? Number(trailing[2]) : 1,
		column: trailing ? Number(trailing[3]) : 1,
		severity: 'error',
		// Not every throw is a parse failure; saying so sends people looking for
		// a syntax mistake that is not there.
		code: code ?? 'OCTANE_COMPILE_ERROR',
		// The position now has its own columns, so drop the duplicate tail.
		message: trailing ? message.slice(0, trailing.index) : message,
		suggestions: [],
	};
}

export default defineCommand({
	description:
		'Compile the project and report every diagnostic the Octane compiler raises:\n' +
		'native-event mistakes, hydration hazards, renderer-boundary and client-only errors.',
	positionals: [
		{
			name: 'path',
			description: 'Files to analyze. Defaults to every .tsrx in the project.',
			variadic: true,
		},
	],
	flags: {
		code: {
			type: 'string',
			repeatable: true,
			placeholder: '<CODE>',
			description: 'Only report this diagnostic code. Repeatable.',
		},
		strict: { type: 'boolean', description: 'Fail the run on warnings, not just errors.' },
	},

	async run(ctx, input) {
		const project = ctx.project();
		const compile = await loadCompiler(project.root);

		const targets =
			input.positionals.length > 0
				? input.positionals.map((file) => path.resolve(ctx.cwd, file))
				: project.tsrxFiles;

		if (targets.length === 0) {
			ctx.ui.intro('octane analyze');
			ctx.ui.outro('No .tsrx files found.');
			return { json: { ok: true, analyzed: 0, findings: [] } };
		}

		ctx.ui.intro('octane analyze');
		const spinner = ctx.ui.spinner(`Compiling ${targets.length} file(s)`);

		/** @type {Finding[]} */
		const findings = [];
		for (const absolute of targets) {
			const file = displayPath(project.root, ctx.cwd, absolute);
			let source;
			try {
				source = readFileSync(absolute, 'utf8');
			} catch (error) {
				// Unreadable is not unparseable; saying so sends people to the wrong fix.
				findings.push(thrownFailure(error, file, 'OCTANE_READ_ERROR'));
				continue;
			}

			try {
				for (const diagnostic of compile(source, absolute, {}).diagnostics ?? []) {
					findings.push({
						file,
						line: diagnostic.start?.line ?? 1,
						column: (diagnostic.start?.column ?? 0) + 1,
						severity: diagnostic.severity === 'error' ? 'error' : 'warning',
						code: diagnostic.code,
						// The compiler prefixes its own code; the report already has a
						// column for it.
						message: String(diagnostic.message).replace(`[${diagnostic.code}] `, ''),
						suggestions: describeSuggestions(diagnostic.suggestions),
					});
				}
			} catch (error) {
				// A file that will not compile is the most severe thing analyze can
				// find, and it must not stop the other files being reported.
				findings.push(thrownFailure(error, file));
			}
		}
		spinner.stop(`Compiled ${targets.length} file(s)`);

		const selected = input.flags.code?.length
			? findings.filter((finding) => input.flags.code.includes(finding.code))
			: findings;

		render(ctx, selected, targets.length);

		const errors = selected.filter((finding) => finding.severity === 'error').length;
		const warnings = selected.length - errors;
		const failed = errors > 0 || (input.flags.strict && warnings > 0);

		return {
			exitCode: failed ? EXIT.DIAGNOSTIC : EXIT.OK,
			json: {
				ok: !failed,
				analyzed: targets.length,
				summary: { errors, warnings },
				findings: selected,
			},
		};
	},
});

/**
 * Project-relative where that is meaningful, otherwise relative to the invoking
 * directory, otherwise absolute. An explicit path outside the project would
 * otherwise render as a wall of `../`.
 *
 * @param {string} root
 * @param {string} cwd
 * @param {string} absolute
 * @returns {string}
 */
function displayPath(root, cwd, absolute) {
	const fromRoot = path.relative(root, absolute);
	if (!fromRoot.startsWith('..')) return fromRoot;
	const fromCwd = path.relative(cwd, absolute);
	return fromCwd.startsWith('..') ? absolute : fromCwd;
}

/**
 * @param {import('../kernel/context.js').Ctx} ctx
 * @param {Finding[]} findings
 * @param {number} analyzed
 */
function render(ctx, findings, analyzed) {
	const { colors } = ctx.ui;

	if (findings.length === 0) {
		ctx.ui.outro(colors.green(`No diagnostics across ${analyzed} file(s).`));
		return;
	}

	for (const file of [...new Set(findings.map((finding) => finding.file))]) {
		ctx.ui.log('');
		ctx.ui.log(colors.bold(file));

		for (const finding of findings.filter((entry) => entry.file === file)) {
			const mark =
				finding.severity === 'error' ? colors.red(SYMBOLS.fail) : colors.yellow(SYMBOLS.warn);
			const where = colors.dim(`${finding.line}:${finding.column}`);
			ctx.ui.log(`  ${mark} ${where}  ${finding.message}`);
			ctx.ui.log(`      ${colors.dim(finding.code)}`);
			for (const suggestion of finding.suggestions) {
				ctx.ui.log(`      ${colors.dim(`suggestion: ${suggestion}`)}`);
			}
		}
	}

	const errors = findings.filter((finding) => finding.severity === 'error').length;
	const warnings = findings.length - errors;
	/** @type {string[]} */
	const parts = [];
	if (errors > 0) parts.push(colors.red(`${errors} error${errors === 1 ? '' : 's'}`));
	if (warnings > 0) parts.push(colors.yellow(`${warnings} warning${warnings === 1 ? '' : 's'}`));

	ctx.ui.log('');
	ctx.ui.log(`${parts.join(colors.dim(' · '))} ${colors.dim(`across ${analyzed} file(s)`)}`);
}
