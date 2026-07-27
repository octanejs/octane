import { existsSync } from 'node:fs';
import path from 'node:path';
import { createExec } from './exec.js';
import { usageError } from './errors.js';
import { detectProject } from './project.js';
import { createUi, resolveMode } from './ui.js';

/**
 * @typedef {Object} Ctx
 * @property {string} cwd
 * @property {NodeJS.ProcessEnv} env
 * @property {string} version
 * @property {import('./ui.js').Ui} ui
 * @property {import('./exec.js').Exec} exec
 * @property {boolean} json
 * @property {boolean} yes
 * @property {boolean} dryRun
 * @property {boolean} verbose
 * @property {() => import('./project.js').Project} project
 * @property {() => import('./project.js').Project} refreshProject
 */

/**
 * @param {{
 *   flags: Record<string, any>,
 *   version: string,
 *   env?: NodeJS.ProcessEnv,
 *   stdout?: NodeJS.WritableStream,
 *   tty?: boolean,
 *   exec?: import('./exec.js').Exec,
 * }} options
 * @returns {Ctx}
 */
export function createContext({
	flags,
	version,
	env = process.env,
	stdout = process.stdout,
	tty = Boolean(/** @type {any} */ (stdout).isTTY),
	exec,
}) {
	const cwd = path.resolve(flags.cwd ?? process.cwd());
	// A typo'd --cwd would otherwise be reported on as if it were an empty
	// project, which reads as a real (and wrong) result.
	if (flags.cwd !== undefined && !existsSync(cwd)) {
		throw usageError(`--cwd directory does not exist: ${cwd}`);
	}
	const json = Boolean(flags.json);
	const ui = createUi({
		mode: resolveMode({ json, color: flags.color !== false, tty, env }),
		yes: Boolean(flags.yes),
		stdout,
	});

	/** @type {import('./project.js').Project | undefined} */
	let project;

	return {
		cwd,
		env,
		version,
		ui,
		exec: exec ?? createExec(env),
		json,
		yes: Boolean(flags.yes),
		dryRun: Boolean(flags['dry-run']),
		verbose: Boolean(flags.verbose),
		project() {
			project ??= detectProject(cwd);
			return project;
		},
		/** Re-read the project from disk, after a command has written to it. */
		refreshProject() {
			project = detectProject(cwd);
			return project;
		},
	};
}
