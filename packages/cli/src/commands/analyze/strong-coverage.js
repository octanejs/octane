import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { CliError } from '../../kernel/errors.js';
import { resolveConfigLoader } from '../../kernel/octane-config.js';

/**
 * The checked-in list of modules allowed to compile without Strong mode.
 *
 * Strong is opt-in per module or per application, so the cheapest way around
 * a Strong diagnostic is to stop being Strong: delete `"use strong"`, turn
 * `compiler.strong` off, or move the code into another package. Each of those
 * is a one-line change that is easy to miss in review. With this file in the
 * project, every module Octane compiles has to be Strong or be named here, and
 * `octane analyze` only ever removes names. A new exception therefore shows up
 * as an edit to this one file, which a team can route to an owner.
 */
export const BASELINE_FILE = 'octane-strong-baseline.json';

export const REGRESSION = 'OCTANE_STRONG_COVERAGE_REGRESSION';
export const STALE = 'OCTANE_STRONG_COVERAGE_STALE';

/**
 * @typedef {{ strong: boolean, directive: boolean, config: boolean }} StrongStatus
 *
 * @typedef {Object} StrongPolicy
 * @property {boolean} configured `compiler.strong` from octane.config
 * @property {(source: string, absolute: string) => StrongStatus} status
 * @property {(source: string) => string | null} jsxPragma the leading
 *   `@jsxImportSource` module, read by the compiler's own scanner
 *
 * @typedef {Object} CoverageModule
 * @property {string} file project-relative, `/`-separated
 * @property {string} absolute
 * @property {StrongStatus} status
 *
 * @typedef {Object} Baseline
 * @property {string} path
 * @property {string} text
 * @property {string[]} exceptions
 */

/**
 * The project's Strong policy, decided by the project's own compiler.
 *
 * `compiler.strong` comes from evaluating octane.config, and the per-module
 * answer comes from the installed bundler compiler's `strongModuleStatus`, the
 * same decision its `transform` makes. Nothing here re-derives the directive
 * prologue or the package-boundary rule.
 *
 * `required` is set when the answer is about to gate a run (a baseline exists
 * or one is being written). A policy that cannot be determined then fails the
 * run. Otherwise the policy only decides whether `compiler.strong` reaches a
 * module, so a project without it needs nothing more (`{ policy: null }`), and
 * one whose setting cannot be applied gets the `reason` to show beside the
 * diagnostics it could still produce.
 *
 * @param {import('../../kernel/project.js').Project} project
 * @param {{ required: boolean }} options
 * @returns {Promise<{ policy: StrongPolicy | null, reason?: string }>}
 */
export async function loadStrongPolicy(project, { required }) {
	/** @param {string} reason */
	const unavailable = (reason) => {
		if (required) throw new CliError(reason);
		return { policy: null, reason };
	};

	let configured = false;
	if (project.octaneConfigPath !== null) {
		const file = path.basename(project.octaneConfigPath);
		const load = await resolveConfigLoader(project.root);
		if (!load) {
			return unavailable(
				`${file} could not be evaluated because @octanejs/app-core is not installed, so its compiler.strong setting is unknown.`,
			);
		}
		try {
			configured = (await load(project.root)).compiler?.strong === true;
		} catch (error) {
			return unavailable(
				`${file} failed to load, so its compiler.strong setting is unknown: ${
					error instanceof Error ? error.message : String(error)
				}`,
			);
		}
	}

	if (!required && !configured) return { policy: null };

	let bundler;
	try {
		const require = createRequire(path.join(project.root, 'noop.js'));
		bundler = await import(pathToFileURL(require.resolve('octane/compiler/bundler')).href);
	} catch {
		return unavailable('Could not resolve `octane/compiler/bundler` from this project.');
	}
	const compiler = bundler.createOctaneCompiler?.({ root: project.root, strong: configured });
	if (
		typeof compiler?.strongModuleStatus !== 'function' ||
		typeof bundler.findLeadingJsxImportSourcePragma !== 'function'
	) {
		return unavailable(
			'The installed octane cannot report which modules compile under Strong mode. Update octane.',
		);
	}

	return {
		policy: {
			configured,
			status: (source, absolute) => compiler.strongModuleStatus(source, absolute),
			jsxPragma: bundler.findLeadingJsxImportSourcePragma,
		},
	};
}

/**
 * A runtime (not type-only) import of octane or one of its subpaths. The
 * clause may span lines but never reaches into the next `import`, so a
 * semicolon-free module cannot borrow a later type-only import's specifier.
 */
const OCTANE_IMPORT =
	/^\s*import\s+(?!type\b)(?:(?!\bimport\b)[^;])*?\bfrom\s*['"]octane(?:\/[^'"]*)?['"]/m;

/**
 * @param {string | undefined} source a JSX import source
 */
function isOctaneJsxSource(source) {
	return source === 'octane' || source === 'octane/strong' || !!source?.startsWith('@octanejs/');
}

/**
 * Is this a module Octane compiles, and so one Strong can reach?
 *
 * `.tsrx` always is. A `.tsx` module is unless its own leading pragma, or the
 * tsconfig `jsxImportSource`, hands its JSX to another library, as a
 * React-hosted project does. A plain `.ts`/`.js` module is when it imports
 * octane at runtime, which is when the compiler slots its hooks. Declaration
 * files and other extensions never are.
 *
 * @param {string} absolute
 * @param {string} source
 * @param {string | undefined} jsxImportSource from tsconfig
 * @param {StrongPolicy} policy
 */
export function isOctaneModule(absolute, source, jsxImportSource, policy) {
	if (absolute.endsWith('.d.ts')) return false;
	const extension = path.extname(absolute);
	if (extension === '.tsrx') return true;
	if (extension === '.tsx') {
		const pragma = policy.jsxPragma(source);
		if (pragma !== null) return isOctaneJsxSource(pragma);
		return jsxImportSource === undefined || isOctaneJsxSource(jsxImportSource);
	}
	if (extension === '.ts' || extension === '.js') return OCTANE_IMPORT.test(source);
	return false;
}

/**
 * @param {string} root
 * @param {string} absolute
 */
export function projectPath(root, absolute) {
	return path.relative(root, absolute).split(path.sep).join('/');
}

/**
 * @param {string} root
 * @returns {Baseline | null}
 */
export function readBaseline(root) {
	const file = path.join(root, BASELINE_FILE);
	if (!existsSync(file)) return null;
	const text = readFileSync(file, 'utf8');
	let parsed;
	try {
		parsed = JSON.parse(text);
	} catch (error) {
		throw new CliError(
			`${BASELINE_FILE} is not valid JSON: ${error instanceof Error ? error.message : error}`,
		);
	}
	if (
		parsed?.version !== 1 ||
		!Array.isArray(parsed.exceptions) ||
		parsed.exceptions.some((/** @type {unknown} */ entry) => typeof entry !== 'string')
	) {
		throw new CliError(
			`${BASELINE_FILE} must be { "version": 1, "exceptions": [<project-relative paths>] }.`,
		);
	}
	return { path: file, text, exceptions: parsed.exceptions };
}

/**
 * Sorted and deduplicated, so the file only changes when its contents do.
 *
 * @param {string} root
 * @param {Iterable<string>} exceptions
 */
export function writeBaseline(root, exceptions) {
	const body = { version: 1, exceptions: [...new Set(exceptions)].sort() };
	writeFileSync(path.join(root, BASELINE_FILE), `${JSON.stringify(body, null, '\t')}\n`);
}

/**
 * Compare the measured modules with the recorded exceptions.
 *
 * A non-Strong module that is not listed is a regression: something new, or
 * something that stopped being Strong. A listed module that is Strong, gone, or
 * no longer compiled by Octane is stale, and is an error too, because a stale
 * name is a pre-approved slot for the next regression. Staleness is only known
 * when every module was measured.
 *
 * @param {{
 *   modules: CoverageModule[],
 *   baseline: Baseline,
 *   policy: StrongPolicy,
 *   complete: boolean,
 *   unmeasured: ReadonlySet<string>,
 *   display: (absolute: string) => string,
 * }} input
 */
export function compareCoverage({ modules, baseline, policy, complete, unmeasured, display }) {
	const listed = new Set(baseline.exceptions);
	const measured = new Map(modules.map((module) => [module.file, module]));
	const baselineDisplay = display(baseline.path);

	/** @type {import('./index.js').Finding[]} */
	const findings = [];
	/** @type {string[]} */
	const regressions = [];
	for (const module of modules) {
		if (module.status.strong || listed.has(module.file)) continue;
		regressions.push(module.file);
		const fix =
			policy.configured && !module.status.config
				? 'compiler.strong in octane.config does not reach modules of another package, so add "use strong" before its imports'
				: 'Add "use strong" before its imports, or enable compiler.strong in octane.config,';
		findings.push({
			file: display(module.absolute),
			line: 1,
			column: 1,
			severity: 'error',
			code: REGRESSION,
			message: `This module compiles without Strong mode and is not a recorded exception. ${fix} and fix what Strong then reports. A new exception is a reviewed edit to ${BASELINE_FILE}; octane analyze never adds one.`,
			suggestions: [],
		});
	}

	/** @type {string[]} */
	const stale = [];
	if (complete) {
		const lines = baseline.text.split('\n');
		for (const entry of baseline.exceptions) {
			const module = measured.get(entry);
			if (unmeasured.has(entry) || (module !== undefined && !module.status.strong)) continue;
			stale.push(entry);
			const why =
				module !== undefined
					? 'now compiles with Strong mode'
					: existsSync(path.join(path.dirname(baseline.path), entry))
						? 'is not a module Octane compiles'
						: 'no longer exists';
			const index = lines.findIndex((line) => line.includes(JSON.stringify(entry)));
			findings.push({
				file: baselineDisplay,
				line: index === -1 ? 1 : index + 1,
				column: 1,
				severity: 'error',
				code: STALE,
				message: `${entry} ${why}, so it is no longer an exception. Run \`octane analyze --strong-baseline update\` to remove it.`,
				suggestions: [],
			});
		}
	}

	return { findings, regressions, stale };
}
