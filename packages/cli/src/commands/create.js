import { existsSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { defineCommand } from '../kernel/command.js';
import { detectProject } from '../kernel/project.js';
import { CliError, EXIT } from '../kernel/errors.js';
import { PACKAGE_MANAGERS } from '../kernel/install.js';
import { applyInit } from './init/index.js';
import { MODES } from './init/templates.js';

/** What the project is called when someone accepts the prompt as offered. */
export const DEFAULT_DIRECTORY = 'octane-app';

/**
 * Which package manager ran this command.
 *
 * `npm create`, `pnpm create` and `yarn create` all set `npm_config_user_agent`
 * to something starting `name/version`. It is the only signal there is: the
 * directory is new, so there is no lockfile to detect, and without this a
 * `pnpm create` would be handed to npm and answered with the wrong lockfile.
 *
 * @param {NodeJS.ProcessEnv} env
 * @returns {string | undefined}
 */
export function invokedThrough(env) {
	const name = (env.npm_config_user_agent ?? '').split('/')[0];
	return PACKAGE_MANAGERS.includes(name) ? name : undefined;
}

/**
 * Write a directory name so the shell the next step gets pasted into reads it
 * as a name. It is whatever someone typed at the prompt, and this command
 * accepts spaces and leading dashes in it.
 *
 * A leading dash needs more than quoting: `cd` parses its argument for options
 * first, so `cd '-app'` fails the same way `cd -app` does, and a lone `cd -`
 * silently goes somewhere else entirely. `./` in front makes it a path again.
 *
 * @param {string} value
 * @returns {string}
 */
export function shellArgument(value) {
	const name = value.startsWith('-') ? `./${value}` : value;
	return /^[\w./@-]+$/.test(name) ? name : `'${name.replaceAll("'", String.raw`'\''`)}'`;
}

/**
 * npm rejects a name with uppercase letters or most punctuation, and the
 * directory someone types is not bound by that.
 *
 * @param {string} directory
 * @returns {string}
 */
export function packageNameFor(directory) {
	const name = path
		.basename(directory)
		.toLowerCase()
		.replace(/[^a-z0-9._-]+/g, '-')
		.replace(/^[._-]+|-+$/g, '');
	return name === '' ? DEFAULT_DIRECTORY : name;
}

export default defineCommand({
	// The whole point is to run where no project exists yet.
	requiresProject: false,
	description:
		'Create an Octane app in a new directory: the files, the config, and the dependencies.\n' +
		'This is what `npm create octane` runs.',
	positionals: [{ name: 'directory', description: 'Directory to create the app in.' }],
	flags: {
		template: {
			type: 'string',
			short: 't',
			choices: Object.keys(MODES),
			placeholder: '<name>',
			description: 'spa for a client-only app, fullstack for routing and SSR.',
		},
		install: {
			type: 'boolean',
			default: true,
			description: 'Install dependencies (--no-install skips).',
		},
		'package-manager': {
			type: 'string',
			choices: PACKAGE_MANAGERS,
			placeholder: '<name>',
			description: 'Install with this one instead of the one that ran the command.',
		},
	},

	async run(ctx, input) {
		if (input.positionals.length > 1) {
			throw new CliError(`Unexpected argument ${input.positionals[1]}.`);
		}

		const directory =
			input.positionals[0] ??
			(await ctx.ui.text({
				message: 'Project name',
				flag: '<directory>',
				placeholder: DEFAULT_DIRECTORY,
				initial: DEFAULT_DIRECTORY,
			}));

		const target = path.resolve(ctx.cwd, directory);
		const existed = existsSync(target);
		// A name that lands on a file is a mistake worth saying out loud. Reading
		// it as a directory throws ENOTDIR, and a raw stack tells someone who
		// mistyped a name nothing about what to do next.
		if (existed && !statSync(target).isDirectory()) {
			throw new CliError(`${directory} already exists and is not a directory.`);
		}
		// A repository with nothing in it is not a project. `mkdir app && cd app &&
		// git init` is a common enough way to start that refusing it would leave
		// this check protecting work that is not there, which is all it is for.
		if (existed && readdirSync(target).some((entry) => entry !== '.git')) {
			// Emptying someone's directory is not this command's call to make.
			throw new CliError(`${directory} already exists and is not empty.`);
		}

		// `mkdirSync` with `recursive` makes every missing parent too, so a name
		// like `apps/web` creates two directories. Undoing only the leaf would
		// leave an empty tree standing, which is not nothing. Leaf first, and only
		// the ones that were not already there.
		/** @type {string[]} */
		const made = [];
		for (let dir = target; !existsSync(dir) && path.dirname(dir) !== dir; dir = path.dirname(dir)) {
			made.push(dir);
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
		// What sits there before the scaffold runs: the manifest just written, and
		// a `.git` if the directory came with one. The cleanup below asks what was
		// added rather than counting entries, so it cannot disagree with the rule
		// above about what an empty directory may already hold.
		const before = new Set(readdirSync(target));

		// Whoever ran `create` owns this project's tooling, and there is no
		// lockfile to work that out from in a directory this new.
		const packageManager = input.flags['package-manager'] ?? invokedThrough(ctx.env);

		let result;
		let wrote = false;
		try {
			result = await applyInit(ctx, detectProject(target), {
				title: 'octane create',
				mode: input.flags.template,
				modeFlag: '--template',
				install: input.flags.install,
				packageManager,
			});
		} finally {
			// Nothing written means no project, and a lone package.json is not one.
			// Declining the confirm is a normal answer and a failure is not, but
			// both leave the same nothing behind, and the directory left over would
			// make the obvious retry fail as already occupied. Only what this
			// command made goes, so a directory that was already there survives
			// with its `.git`, which is also why this cannot be inferred afterwards
			// from whether the directory is still standing.
			wrote = readdirSync(target).some((entry) => !before.has(entry));
			if (!wrote) {
				rmSync(path.join(target, 'package.json'), { force: true });
				for (const dir of made) {
					// Anything left in one of these by now is not ours to remove.
					if (readdirSync(dir).length > 0) break;
					rmSync(dir, { recursive: true, force: true });
				}
			}
		}

		if (!wrote) {
			ctx.ui.log('');
			ctx.ui.log('Nothing was created.');
			return result;
		}
		if (result.exitCode !== undefined && result.exitCode !== EXIT.OK) return result;

		// Spelled for the manager they used, since telling a pnpm user to run npm
		// is how a project ends up with two lockfiles. `run` is the one spelling
		// every manager accepts.
		const runner = packageManager ?? 'npm';
		// Skipping the install leaves the manifest with no dependencies in it at
		// all, because dependencies are recorded by handing them to the package
		// manager rather than by writing ranges. A bare `install` would resolve an
		// empty manifest, succeed at nothing, and leave `run dev` to fail on a
		// missing octane. The exact packages were printed above, so send them
		// there rather than spelling a command that does not do the job.
		ctx.ui.log('');
		ctx.ui.note('Next', [
			`cd ${shellArgument(directory)}`,
			...(input.flags.install === false
				? ['install the packages listed under "Do this by hand"']
				: []),
			`${runner} run dev`,
		]);

		return { json: { ...result.json, directory, packageManager: runner } };
	},
});
