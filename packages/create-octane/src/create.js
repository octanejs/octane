import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import * as clack from '@clack/prompts';
import { EXIT, main, resolveMode } from '@octanejs/cli';

/** The two shapes an Octane app comes in, named as `octane init` names them. */
export const TEMPLATES = ['spa', 'fullstack'];

/** What the project is called when someone accepts the prompt as offered. */
export const DEFAULT_DIRECTORY = 'octane-app';

// Worded as `octane init` words its own modes, so the same two choices do not
// read as different ones depending on which command you reached them through.
const TEMPLATE_CHOICES = [
	{
		value: 'spa',
		label: 'Client-only app',
		hint: "compiles .tsrx, keeps the bundler's standard HTML handling",
	},
	{
		value: 'fullstack',
		label: 'Routing and SSR',
		hint: 'adds octane.config.ts, streaming SSR, hydration, production build',
	},
];

const USAGE = `Usage: create-octane <directory> [--template <${TEMPLATES.join('|')}>] [--no-install]

  spa         a client-only app
  fullstack   routing, server rendering, and a production build

Omit an argument to be asked for it. --no-install skips installing dependencies,
which also leaves them out of package.json for you to add.
`;

/**
 * The questions this command can ask. Injectable so the flow is testable
 * without a terminal: a cancelled prompt is `null` rather than clack's symbol,
 * which keeps that detail from leaking into the caller.
 *
 * @typedef {Object} Prompts
 * @property {(message: string) => void} cancel
 * @property {(options: { message: string, placeholder: string, defaultValue: string })
 *   => Promise<string | null>} text
 * @property {(options: { message: string,
 *   options: { value: string, label: string, hint: string }[] })
 *   => Promise<string | null>} select
 */

/** @type {Prompts} */
const clackPrompts = {
	cancel: (message) => clack.cancel(message),
	async text(options) {
		const answer = await clack.text(options);
		return clack.isCancel(answer) ? null : String(answer);
	},
	async select(options) {
		const answer = await clack.select(options);
		return clack.isCancel(answer) ? null : String(answer);
	},
};

/**
 * @param {Prompts} prompts
 * @returns {number}
 */
function cancelled(prompts) {
	prompts.cancel('Nothing was created.');
	return EXIT.OK;
}

/**
 * npm rejects a name with uppercase letters or most punctuation, and the
 * directory someone types is not bound by that.
 *
 * @param {string} directory
 * @returns {string}
 */
function packageNameFor(directory) {
	const name = path
		.basename(directory)
		.toLowerCase()
		.replace(/[^a-z0-9._-]+/g, '-')
		.replace(/^[._-]+|-+$/g, '');
	return name === '' ? 'octane-app' : name;
}

/**
 * @param {string[]} argv
 * @returns {{ directory?: string, template?: string, install?: boolean, help?: boolean,
 *   error?: string }}
 */
export function parseArgv(argv) {
	/** @type {{ directory?: string, template?: string, install?: boolean, help?: boolean,
	 *   error?: string }} */
	const parsed = {};

	for (let index = 0; index < argv.length; index++) {
		const argument = argv[index];

		if (argument === '--help' || argument === '-h') {
			parsed.help = true;
			continue;
		}

		if (argument === '--no-install') {
			parsed.install = false;
			continue;
		}

		const template =
			argument === '--template' || argument === '-t'
				? argv[++index]
				: argument.startsWith('--template=')
					? argument.slice('--template='.length)
					: null;

		if (template !== null) {
			if (!TEMPLATES.includes(template)) {
				// `||`, not `??`: `--template=` reaches here as an empty string.
				return { error: `Unknown template ${template || '(missing)'}.` };
			}
			parsed.template = template;
			continue;
		}

		if (argument.startsWith('-')) return { error: `Unknown option ${argument}.` };
		if (parsed.directory !== undefined) return { error: `Unexpected argument ${argument}.` };
		parsed.directory = argument;
	}

	return parsed;
}

/**
 * Create a directory and hand it to `octane init`.
 *
 * The templates live in the CLI, because `init` writes exactly these files into
 * a project that already exists. Owning a second copy here would let the two
 * scaffolds drift, and the one people hit first would be the unmaintained one.
 *
 * @param {string[]} argv
 * @param {{ cwd?: string, stdout?: NodeJS.WritableStream, stderr?: NodeJS.WritableStream,
 *   tty?: boolean, env?: NodeJS.ProcessEnv, prompts?: Prompts,
 *   cli?: { env?: NodeJS.ProcessEnv, stdout?: NodeJS.WritableStream,
 *     stderr?: NodeJS.WritableStream, tty?: boolean, exec?: {
 *       which: (bin: string) => string | null,
 *       run: (file: string, args: string[], options?: { cwd?: string })
 *         => Promise<{ code: number, stdout: string, stderr: string }>,
 *     } } }} [options]
 * @returns {Promise<number>}
 */
export async function create(argv, options = {}) {
	const stdout = options.stdout ?? process.stdout;
	const stderr = options.stderr ?? process.stderr;
	const cwd = options.cwd ?? process.cwd();
	const env = options.env ?? process.env;
	// The same question `init` asks itself, asked the same way. A terminal is
	// necessary but not sufficient: `CI` and `NO_COLOR` mean nobody is watching
	// even when one is attached, and deciding that here with a bare TTY check
	// while asking `resolveMode` further down left this command prompting where
	// the one it drives had already concluded there was no one to answer.
	const interactive =
		resolveMode({ tty: options.tty ?? process.stdout.isTTY === true, env }) === 'interactive';

	const parsed = parseArgv(argv);

	if (parsed.help) {
		stdout.write(USAGE);
		return EXIT.OK;
	}
	if (parsed.error) {
		stderr.write(`${parsed.error}\n\n${USAGE}`);
		return EXIT.USAGE;
	}

	// A flag always wins. What is missing is asked for when someone is there to
	// answer, and is a usage error when nobody is, so a script never hangs on a
	// prompt it cannot see.
	let { directory, template } = parsed;
	const prompts = options.prompts ?? clackPrompts;

	if (directory === undefined || template === undefined) {
		if (!interactive) {
			stderr.write(
				`${directory === undefined ? 'Name the directory to create.' : 'Choose a template with --template.'}\n\n${USAGE}`,
			);
			return EXIT.USAGE;
		}

		if (directory === undefined) {
			const answer = await prompts.text({
				message: 'Project name',
				placeholder: DEFAULT_DIRECTORY,
				defaultValue: DEFAULT_DIRECTORY,
			});
			if (answer === null) return cancelled(prompts);
			directory = answer.trim() === '' ? DEFAULT_DIRECTORY : answer.trim();
		}

		if (template === undefined) {
			const answer = await prompts.select({
				message: 'Which template?',
				options: TEMPLATE_CHOICES,
			});
			if (answer === null) return cancelled(prompts);
			template = answer;
		}
	}

	const target = path.resolve(cwd, directory);
	const existed = existsSync(target);
	// A repository with nothing in it is not a project. `mkdir app && cd app &&
	// git init` is a common enough way to start that refusing it would leave this
	// check protecting work that is not there, which is the only thing it is for.
	if (existed && readdirSync(target).some((entry) => entry !== '.git')) {
		// Emptying someone's directory is not this command's call to make.
		stderr.write(`${directory} already exists and is not empty.\n`);
		return EXIT.FAILURE;
	}

	mkdirSync(target, { recursive: true });
	writeFileSync(
		path.join(target, 'package.json'),
		`${JSON.stringify(
			{ name: packageNameFor(target), private: true, version: '0.0.0', type: 'module' },
			null,
			2,
		)}\n`,
	);
	// What sits there before init runs: the manifest just written, and a `.git`
	// if the directory came with one. The cleanup below asks what init added
	// rather than counting entries, so it cannot disagree with the rule above
	// about what an empty directory may already hold.
	const before = new Set(readdirSync(target));

	// `--force` is not a shortcut here. init refuses a dirty tree so `git diff`
	// stays a usable review of what it wrote, and that reasoning is about a
	// project someone already has. This directory did not exist a moment ago, so
	// there is no work of theirs to protect, but running inside a repository that
	// happens to have changes elsewhere would otherwise stop the scaffold dead.
	// The template is settled by now, from a flag or from the prompt above, so
	// init never asks which one again in a slightly different style.
	const argvForInit = ['init', '--cwd', target, '--force', '--mode', template];

	const cli = { ...options.cli };
	cli.tty ??= interactive;
	// On a terminal init lists what it will write and install and asks to
	// confirm, which is worth seeing before any of it happens. With nobody there
	// the same prompt is a dead end rather than a question, and init refuses to
	// run at all without `--yes`, so the flag goes on exactly then. Asked of the
	// options init will actually receive, which a caller can set apart from this
	// command's own.
	const willPrompt = resolveMode({ tty: cli.tty, env: cli.env ?? env }) === 'interactive';
	if (!willPrompt) argvForInit.push('--yes');
	// Installing is what puts the dependencies in package.json: init records them
	// through the package manager rather than pinning versions of its own. Skip
	// it and the manifest declares nothing, so this is the default and skipping
	// prints the list to install by hand.
	if (parsed.install === false) argvForInit.push('--no-install');

	// init keeps whatever terminal it was given, so its report renders in the
	// same style as the questions above rather than dropping to plain text
	// halfway through.
	const exitCode = await main(argvForInit, cli);

	// Whether init succeeded or failed, it may have written nothing, and a lone
	// package.json is not a project. Declining the confirm is a normal,
	// successful answer; an install that failed is not, and both leave the same
	// nothing behind. Undoing it matters either way, because the directory it
	// left would make the obvious retry fail as already occupied. The directory
	// itself goes only when this command is the one that made it, so a `.git`
	// that was already there survives, and anything init did manage to write is
	// left alone to be looked at.
	if (!readdirSync(target).some((entry) => !before.has(entry))) {
		rmSync(path.join(target, 'package.json'), { force: true });
		if (!existed) rmSync(target, { recursive: true, force: true });
		if (exitCode === EXIT.OK) stdout.write('Nothing was created.\n');
		return exitCode;
	}

	if (exitCode !== EXIT.OK) return exitCode;

	// No frame of its own around any of this. init already draws one around its
	// report, and a second set of borders from here only ever left a dangling
	// one open or closed.
	const next = parsed.install === false ? '  npm install\n' : '';
	stdout.write(`\nDone. Next:\n\n  cd ${directory}\n${next}  npm run dev\n`);
	return EXIT.OK;
}
