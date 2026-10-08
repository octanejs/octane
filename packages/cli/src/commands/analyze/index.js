import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { DATA } from '../../data/index.js';
import { defineCommand } from '../../kernel/command.js';
import { CliError, EXIT, usageError } from '../../kernel/errors.js';
import { SOURCE_FILE_LIMIT } from '../../kernel/project.js';
import { SYMBOLS } from '../../kernel/ui.js';
import {
	BASELINE_FILE,
	STALE,
	compareCoverage,
	isOctaneModule,
	loadJsxPragma,
	loadStrongPolicy,
	projectPath,
	readBaseline,
	writeBaseline,
} from './strong-coverage.js';
import { applyFixes, pruneImports } from './fix.js';

/**
 * @typedef {Object} Finding
 * @property {string} file relative to the project root
 * @property {number} line
 * @property {number} column 1-based, matching editor gutters
 * @property {'error' | 'warning' | 'hint'} severity
 * @property {string} code
 * @property {string} message
 * @property {string[]} suggestions
 * @property {{ start: number, end: number, text: string }[]} [edits] the
 *   source edits `--fix` applies, as offsets into the file's current text
 * @property {string} [url] where the code is documented
 * @property {true} [preview] only reported because `--strong-preview`
 *   compiled a module that is not Strong as if it were
 */

/**
 * @typedef {Object} Compiler
 * @property {(source: string, filename: string, options?: object) => { diagnostics: readonly any[] }} compile
 * @property {((source: string, filename: string, options?: object) => { diagnostics: any[], error: unknown }) | null} collectDiagnostics
 *   every diagnostic in a module, where `compile` throws the first error.
 *   Older compilers do not have it.
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
 * @returns {Promise<Compiler>}
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
	return {
		compile: module.compile,
		collectDiagnostics:
			typeof module.collectDiagnostics === 'function' ? module.collectDiagnostics : null,
	};
}

/**
 * Strong codes and the native text `onChange` error Strong promotes, keyed to
 * their documentation.
 *
 * @type {Record<string, { url: string }>}
 */
const STRONG_CODES = DATA.strongDiagnostics?.diagnostics ?? {};

/**
 * @param {any} diagnostic
 * @param {string} file
 * @returns {Finding}
 */
function findingOf(diagnostic, file) {
	/** @type {Finding} */
	const finding = {
		file,
		line: diagnostic.start?.line ?? 1,
		column: (diagnostic.start?.column ?? 0) + 1,
		severity:
			diagnostic.severity === 'error'
				? 'error'
				: diagnostic.severity === 'hint'
					? 'hint'
					: 'warning',
		code: diagnostic.code,
		// The compiler prefixes its own code; the report already has a column
		// for it.
		message: String(diagnostic.message).replace(`[${diagnostic.code}] `, ''),
		suggestions: describeSuggestions(diagnostic.suggestions),
	};
	/** @type {{ start: number, end: number, text: string }[] | undefined} */
	const edits = diagnostic.suggestions?.find((/** @type {any} */ suggestion) =>
		Array.isArray(suggestion?.edits),
	)?.edits;
	if (edits?.length) {
		finding.edits = edits.map(({ start, end, text }) => ({ start, end, text }));
	}
	const url = STRONG_CODES[diagnostic.code]?.url;
	if (url !== undefined) finding.url = url;
	return finding;
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
 * Position a parser appends to its own message, e.g. `Unexpected token (2:10)`:
 * the zero-based `loc` an Acorn-style `SyntaxError` also carries.
 */
const PARSER_LOCATION = /\s*\((\d+):(\d+)\)\s*$/;

/**
 * A compiler error that carries its own code, e.g. a Strong rule:
 * `/abs/App.tsrx:4:21: [OCTANE_STRONG_EFFECT_STATE_UPDATE] Strong mode …`.
 * The position is already in the finding's columns.
 */
const COMPILER_CODE = /^(?:[^\n]*?:\d+:\d+: )?\[(OCTANE_[A-Z0-9_]+)\] /;

/**
 * A leading `"use strong"` directive, after any comments such as a JSX pragma.
 * Only consulted without a Strong policy, when `compiler.strong` is off and
 * the directive is the one way a module can be Strong.
 */
const STRONG_DIRECTIVE =
	/^(?:\s|\/\/[^\n]*|\/\*[\s\S]*?\*\/)*(?:(['"])use [^'"]*\1\s*;?\s*)*?(['"])use strong\2/;

/**
 * Normalise a thrown compile failure into a finding.
 *
 * Two shapes reach here. A genuine parse failure carries a `loc`: a syntax
 * error has Acorn's `{ line, column }` and repeats it at the end of its message,
 * and a parser diagnostic with a range (two outputs in one code block, a
 * redeclared binding) has `{ start, end }`. A semantic failure (a slot-keyed
 * hook in a plain JS loop, say) is thrown with its position appended to the
 * message instead, so recovering it keeps the report pointing at the offending
 * line rather than at 1:1.
 *
 * @param {unknown} error
 * @param {string} file
 * @param {string} [code] overrides the derived code, for a read failure
 * @returns {Finding}
 */
function thrownFailure(error, file, code) {
	const thrown = error instanceof Error ? error.message : String(error);
	// A coded compiler error names its rule; reporting it as a parse failure
	// would hide the code that `--code` filters on and the docs index.
	const coded = COMPILER_CODE.exec(thrown);
	const message = coded ? thrown.slice(coded[0].length) : thrown;
	code ??= coded?.[1];
	const loc = /** @type {any} */ (error)?.loc;
	if (loc) {
		const start = loc.start ?? loc;
		const line = start.line ?? 1;
		const column = start.column ?? 0;
		// The position has its own columns, so drop the parser's copy of it.
		const repeated = PARSER_LOCATION.exec(message);
		const duplicate =
			repeated !== null && Number(repeated[1]) === line && Number(repeated[2]) === column;
		return {
			file,
			line,
			column: column + 1,
			severity: 'error',
			code: code ?? 'OCTANE_PARSE_ERROR',
			message: duplicate ? message.slice(0, repeated.index) : message,
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
			description:
				'Files to analyze. Defaults to every .tsrx in the project, and every .tsx whose\n' +
				'JSX belongs to Octane.',
			variadic: true,
		},
	],
	flags: {
		fix: {
			type: 'boolean',
			description:
				'Apply the edits the compiler suggests, such as useMemo(() => value, deps) to\n' +
				"value and React's lazy ref initialization to useLazyRef, then report what\n" +
				'remains. --dry-run reports the fixes without writing them.',
		},
		'strong-preview': {
			type: 'boolean',
			description:
				'Compile every module as if Strong mode were on and report what it would\n' +
				'reject, counted by code. Findings in modules that are not Strong yet do not\n' +
				'fail the run.',
		},
		code: {
			type: 'string',
			repeatable: true,
			placeholder: '<CODE>',
			description: 'Only report this diagnostic code. Repeatable.',
		},
		strict: { type: 'boolean', description: 'Fail the run on warnings, not just errors.' },
		'strong-baseline': {
			type: 'string',
			choices: ['init', 'update'],
			placeholder: '<init|update>',
			description:
				`Write ${BASELINE_FILE}, the modules allowed to compile without Strong mode.\n` +
				'init records every such module once; update only removes names that are no\n' +
				'longer exceptions. While the file exists, every run fails on a module that\n' +
				'is neither Strong nor listed, and on a listed name that is out of date.',
		},
	},

	async run(ctx, input) {
		const project = ctx.project();
		const compiler = await loadCompiler(project.root);
		const preview = input.flags['strong-preview'] === true;

		// Coverage is a property of the whole project: an explicit file list can
		// show that one of its files regressed, but not that a recorded exception
		// went stale, and it must never write the baseline.
		const whole = input.positionals.length === 0;
		const write = /** @type {'init' | 'update' | undefined} */ (input.flags['strong-baseline']);
		if (write !== undefined && !whole) {
			throw usageError('--strong-baseline measures the whole project; drop the file arguments.');
		}
		let baseline = readBaseline(project.root);
		if (write === 'init' && baseline !== null) {
			throw usageError(
				`${BASELINE_FILE} already exists.`,
				'`--strong-baseline update` removes names that are no longer exceptions; it never adds one.',
			);
		}
		if (write === 'update' && baseline === null) {
			throw usageError(
				`${BASELINE_FILE} does not exist.`,
				'Record one with `--strong-baseline init`.',
			);
		}
		const measureCoverage = baseline !== null || write !== undefined;
		const { policy, reason } = await loadStrongPolicy(project, { required: measureCoverage });
		const jsxImportSource = project.tsconfig?.config?.compilerOptions?.jsxImportSource;

		/** @type {Map<string, string>} */
		const sources = new Map();
		/** @param {string} absolute */
		const read = (absolute) => {
			let source = sources.get(absolute);
			if (source === undefined) {
				source = readFileSync(absolute, 'utf8');
				sources.set(absolute, source);
			}
			return source;
		};

		/** @type {string[]} */
		const notes = [];
		if (reason !== undefined) notes.push(reason);
		let targets;
		if (!whole) {
			targets = input.positionals.map((file) => path.resolve(ctx.cwd, file));
		} else {
			// A .tsx module is analyzed when its JSX goes to Octane, by the same
			// pragma and tsconfig rule the coverage baseline uses. Another
			// framework's JSX in a mixed project is left alone.
			const ownership = policy ?? (await loadJsxPragma(project.root));
			const tsx = project.sourceFiles.filter((file) => file.endsWith('.tsx'));
			targets = [...project.tsrxFiles];
			if (ownership === null) {
				if (tsx.length > 0) {
					notes.push(
						'The installed octane cannot say which .tsx modules are Octane JSX, so only .tsrx files were analyzed. Name .tsx files explicitly, or update octane.',
					);
				}
			} else {
				for (const absolute of tsx) {
					let source;
					try {
						source = read(absolute);
					} catch {
						continue;
					}
					if (isOctaneModule(absolute, source, jsxImportSource, ownership)) targets.push(absolute);
				}
				targets.sort();
			}
		}
		if (compiler.collectDiagnostics === null) {
			notes.push(
				'The installed octane reports only the first error in each file. Update octane to see every finding.',
			);
		}

		if (targets.length === 0 && !measureCoverage) {
			ctx.ui.intro('octane analyze');
			ctx.ui.outro('No Octane modules found.');
			return { json: { ok: true, analyzed: 0, findings: [] } };
		}

		ctx.ui.intro('octane analyze');
		for (const note of notes) ctx.ui.log(ctx.ui.colors.yellow(`${SYMBOLS.warn} ${note}`));
		const spinner = ctx.ui.spinner(`Compiling ${targets.length} file(s)`);

		/** @type {Map<string, import('./strong-coverage.js').StrongStatus>} */
		const statuses = new Map();
		// One parse per module answers both the compile options and coverage.
		/** @param {string} absolute @param {string} source */
		const statusOf = (absolute, source) => {
			let status = statuses.get(absolute);
			if (status === undefined && policy) {
				status = policy.status(source, absolute);
				statuses.set(absolute, status);
			}
			return status;
		};

		/**
		 * Every finding in one module, under the policy the build applies:
		 * octane.config's compiler.strong reaches a module without a directive
		 * of its own. `--strong-preview` applies Strong to every module.
		 *
		 * @param {string} absolute
		 * @param {string} source
		 * @param {string} file
		 * @returns {Finding[]}
		 */
		const analyzeModule = (absolute, source, file) => {
			let strong = false;
			try {
				const status = statusOf(absolute, source);
				strong = status?.strong ?? STRONG_DIRECTIVE.test(source);
			} catch {
				// Unparseable; the compile below reports it in its own terms.
			}
			const options = strong || preview ? { strong: true } : {};
			/** @type {Finding[]} */
			const found = [];
			if (compiler.collectDiagnostics !== null) {
				// A file that will not compile is the most severe thing analyze can
				// find, and it must not stop the other files being reported.
				try {
					const result = compiler.collectDiagnostics(source, absolute, options);
					for (const diagnostic of result.diagnostics) found.push(findingOf(diagnostic, file));
					if (result.error != null) found.push(thrownFailure(result.error, file));
				} catch (error) {
					found.push(thrownFailure(error, file));
				}
			} else {
				try {
					for (const diagnostic of compiler.compile(source, absolute, options).diagnostics ?? []) {
						found.push(findingOf(diagnostic, file));
					}
				} catch (error) {
					found.push(thrownFailure(error, file));
				}
			}
			if (preview && !strong) {
				for (const finding of found) {
					if (finding.code in STRONG_CODES) finding.preview = true;
				}
			}
			return found;
		};

		/** @type {Finding[]} */
		const findings = [];
		let fixedFindings = 0;
		/** @type {string[]} */
		const fixedFiles = [];
		for (const absolute of targets) {
			const file = displayPath(project.root, ctx.cwd, absolute);
			let source;
			try {
				source = read(absolute);
			} catch (error) {
				// Unreadable is not unparseable; saying so sends people to the wrong fix.
				findings.push(thrownFailure(error, file, 'OCTANE_READ_ERROR'));
				continue;
			}
			let found = analyzeModule(absolute, source, file);
			if (input.flags.fix) {
				const fixes = found.flatMap((finding) =>
					finding.edits ? [{ code: finding.code, edits: finding.edits }] : [],
				);
				if (fixes.length > 0) {
					const { text, applied } = applyFixes(source, fixes);
					const next = pruneImports(text, ['useCallback', 'useMemo', 'useRef']);
					if (applied.length > 0 && next !== source) {
						fixedFindings += applied.length;
						fixedFiles.push(file);
						if (!ctx.dryRun) writeFileSync(absolute, next);
						// Report what the fixed module still has, not what was fixed.
						sources.set(absolute, next);
						statuses.delete(absolute);
						found = analyzeModule(absolute, next, file);
					}
				}
			}
			findings.push(...found);
		}
		spinner.stop(`Compiled ${targets.length} file(s)`);
		if (input.flags.fix) {
			ctx.ui.log(
				fixedFindings === 0
					? 'No findings had an automatic fix.'
					: `${ctx.dryRun ? 'Would fix' : 'Fixed'} ${fixedFindings} finding(s) in ${fixedFiles.length} file(s).`,
			);
		}

		/** @type {Record<string, unknown> | undefined} */
		let strongCoverage;
		if (measureCoverage && policy !== null) {
			if (whole && project.sourceFiles.length >= SOURCE_FILE_LIMIT) {
				throw new CliError(
					`The project has more than ${SOURCE_FILE_LIMIT} source files, so Strong coverage cannot be measured completely.`,
				);
			}
			/** @type {import('./strong-coverage.js').CoverageModule[]} */
			const modules = [];
			/** @type {Set<string>} */
			const unmeasured = new Set();
			for (const absolute of whole ? project.sourceFiles : targets) {
				const file = projectPath(project.root, absolute);
				if (file.startsWith('../') || path.isAbsolute(file)) continue;
				let source;
				try {
					source = read(absolute);
				} catch {
					unmeasured.add(file);
					continue;
				}
				if (!isOctaneModule(absolute, source, jsxImportSource, policy)) continue;
				try {
					const status = /** @type {import('./strong-coverage.js').StrongStatus} */ (
						statusOf(absolute, source)
					);
					modules.push({ file, absolute, status });
				} catch {
					// A module that does not parse fails its build and, as a target,
					// this report. It is neither a regression nor proof of staleness.
					unmeasured.add(file);
				}
			}

			if (write === 'init') {
				const exceptions = modules.filter((module) => !module.status.strong);
				if (!ctx.dryRun)
					writeBaseline(
						project.root,
						exceptions.map((module) => module.file),
					);
				baseline = {
					path: path.join(project.root, BASELINE_FILE),
					text: '',
					exceptions: exceptions.map((module) => module.file),
				};
			}
			const current = /** @type {import('./strong-coverage.js').Baseline} */ (baseline);
			const comparison = compareCoverage({
				modules,
				baseline: current,
				policy,
				complete: whole,
				unmeasured,
				display: (absolute) => displayPath(project.root, ctx.cwd, absolute),
			});
			let exceptions = current.exceptions;
			let coverageFindings = comparison.findings;
			if (write === 'update') {
				const stale = new Set(comparison.stale);
				exceptions = exceptions.filter((entry) => !stale.has(entry));
				if (!ctx.dryRun) {
					writeBaseline(project.root, exceptions);
					coverageFindings = coverageFindings.filter((finding) => finding.code !== STALE);
				}
			}
			findings.push(...coverageFindings);

			const strong = modules.filter((module) => module.status.strong).length;
			ctx.ui.log(
				`Strong coverage: ${strong} of ${modules.length} module(s), ${exceptions.length} recorded exception(s)`,
			);
			if (write !== undefined) {
				const changed =
					write === 'init'
						? `${ctx.dryRun ? 'Would record' : 'Recorded'} ${exceptions.length} exception(s)`
						: `${ctx.dryRun ? 'Would remove' : 'Removed'} ${comparison.stale.length} name(s)`;
				ctx.ui.log(`${changed} in ${BASELINE_FILE}`);
			}
			strongCoverage = {
				baseline: BASELINE_FILE,
				modules: modules.length,
				strong,
				exceptions: exceptions.length,
				regressions: comparison.regressions,
				stale: comparison.stale,
			};
		}

		const selected = input.flags.code?.length
			? findings.filter((finding) => input.flags.code.includes(finding.code))
			: findings;

		render(ctx, selected, targets.length);

		// Preview findings describe modules that are not Strong yet. They are an
		// inventory, not a failure, so they are summarized apart.
		const enforced = selected.filter((finding) => finding.preview !== true);
		const errors = enforced.filter((finding) => finding.severity === 'error').length;
		const warnings = enforced.filter((finding) => finding.severity === 'warning').length;
		const hints = enforced.filter((finding) => finding.severity === 'hint').length;
		const failed = errors > 0 || (input.flags.strict && warnings > 0);

		/** @type {Record<string, unknown> | undefined} */
		let strongPreview;
		if (preview) {
			/** @type {Record<string, number>} */
			const byCode = {};
			const modules = new Set();
			for (const finding of selected) {
				if (finding.preview !== true) continue;
				byCode[finding.code] = (byCode[finding.code] ?? 0) + 1;
				modules.add(finding.file);
			}
			strongPreview = {
				findings: Object.values(byCode).reduce((a, b) => a + b, 0),
				modules: modules.size,
				byCode,
			};
			renderPreview(ctx, byCode, modules.size);
		}

		return {
			exitCode: failed ? EXIT.DIAGNOSTIC : EXIT.OK,
			json: {
				ok: !failed,
				analyzed: targets.length,
				summary: { errors, warnings, hints },
				findings: selected,
				...(strongCoverage === undefined ? null : { strongCoverage }),
				...(strongPreview === undefined ? null : { strongPreview }),
				...(input.flags.fix ? { fixed: { findings: fixedFindings, files: fixedFiles } } : null),
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
 * @param {import('../../kernel/context.js').Ctx} ctx
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
				finding.severity === 'error'
					? colors.red(SYMBOLS.fail)
					: finding.severity === 'hint'
						? colors.dim('hint')
						: colors.yellow(SYMBOLS.warn);
			const where = colors.dim(`${finding.line}:${finding.column}`);
			ctx.ui.log(`  ${finding.preview ? colors.dim('strong') : mark} ${where}  ${finding.message}`);
			ctx.ui.log(
				`      ${colors.dim(finding.url ? `${finding.code}  ${finding.url}` : finding.code)}`,
			);
			for (const suggestion of finding.suggestions) {
				ctx.ui.log(
					`      ${colors.dim(`suggestion: ${suggestion}${finding.edits ? ' (--fix)' : ''}`)}`,
				);
			}
		}
	}

	const enforced = findings.filter((finding) => finding.preview !== true);
	const errors = enforced.filter((finding) => finding.severity === 'error').length;
	const warnings = enforced.filter((finding) => finding.severity === 'warning').length;
	const hints = enforced.filter((finding) => finding.severity === 'hint').length;
	const previewed = findings.length - enforced.length;
	/** @type {string[]} */
	const parts = [];
	if (errors > 0) parts.push(colors.red(`${errors} error${errors === 1 ? '' : 's'}`));
	if (warnings > 0) parts.push(colors.yellow(`${warnings} warning${warnings === 1 ? '' : 's'}`));
	if (hints > 0) parts.push(colors.dim(`${hints} hint${hints === 1 ? '' : 's'}`));
	if (previewed > 0) parts.push(`${previewed} Strong preview finding${previewed === 1 ? '' : 's'}`);

	ctx.ui.log('');
	ctx.ui.log(`${parts.join(colors.dim(' · '))} ${colors.dim(`across ${analyzed} file(s)`)}`);
}

/**
 * What adopting Strong would take, by code, most frequent first.
 *
 * @param {import('../../kernel/context.js').Ctx} ctx
 * @param {Record<string, number>} byCode
 * @param {number} modules
 */
function renderPreview(ctx, byCode, modules) {
	const { colors } = ctx.ui;
	const entries = Object.entries(byCode).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
	ctx.ui.log('');
	if (entries.length === 0) {
		ctx.ui.log(colors.green('Strong preview: nothing to change.'));
		return;
	}
	ctx.ui.log(colors.bold(`Strong preview: ${modules} module(s) need changes`));
	for (const [code, count] of entries) {
		ctx.ui.log(`  ${String(count).padStart(4)}  ${code}`);
	}
	ctx.ui.log(colors.dim('  Explain a code with `octane explain <CODE>`.'));
}
