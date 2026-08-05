import { CliError } from './errors.js';

/** How each package manager spells "add a dependency". */
const MANAGERS = {
	pnpm: { add: ['add'], dev: '-D' },
	npm: { add: ['install'], dev: '--save-dev' },
	yarn: { add: ['add'], dev: '-D' },
	bun: { add: ['add'], dev: '-d' },
};

/**
 * Dependency install scripts pnpm should be told to run.
 *
 * pnpm blocks them until the project records a decision, and since 11.0 an
 * undecided script fails the whole install rather than warning: the packages
 * land on disk and pnpm still exits non-zero. A scaffold that says nothing
 * therefore stops partway through, with the dependencies installed and the dev
 * dependencies missing, which leaves an app whose `dev` script cannot start.
 *
 * esbuild is the one the generated projects cannot run without: its install
 * script is how vite's platform binary arrives. Only packages named here are
 * approved, so a build script arriving through some other dependency stays the
 * user's call to make.
 *
 * npm and yarn run install scripts by default and need none of this. bun blocks
 * them like pnpm but exits zero, so it never breaks the scaffold; teaching the
 * templates `trustedDependencies` is a separate change.
 */
export const PNPM_ALLOWED_BUILDS = ['esbuild'];

/** What pnpm calls the failure above. */
const IGNORED_BUILDS = 'ERR_PNPM_IGNORED_BUILDS';

/** Said once per run: the build script is the same one every install trips on. */
const APPROVE_BUILDS =
	'pnpm blocked a dependency install script. Run `pnpm approve-builds` to decide on it.';

/**
 * The managers this CLI knows how to drive. Derived rather than written out, so
 * that a flag can never offer a manager `installCommand` would silently answer
 * with npm's spelling.
 */
export const PACKAGE_MANAGERS = Object.keys(MANAGERS);

/**
 * @param {import('./project.js').Project} project
 * @param {string[]} names
 * @param {boolean} dev
 * @param {{ allowBuilds?: readonly string[] }} [options]
 * @returns {{ manager: string, args: string[] }}
 */
export function installCommand(project, names, dev = false, { allowBuilds = [] } = {}) {
	const manager = project.packageManager ?? 'npm';
	const recipe = MANAGERS[/** @type {keyof typeof MANAGERS} */ (manager)] ?? MANAGERS.npm;
	// `--allow-build` is pnpm's spelling, and npm would read it as a package name.
	const approvals = manager === 'pnpm' ? allowBuilds.map((name) => `--allow-build=${name}`) : [];
	return {
		manager,
		args: [...recipe.add, ...approvals, ...(dev ? [recipe.dev] : []), ...names],
	};
}

/**
 * Install through the project's own package manager, which owns version
 * resolution. The CLI never invents a version range.
 *
 * @param {import('./context.js').Ctx} ctx
 * @param {import('./project.js').Project} project
 * @param {string[]} names
 * @param {{ dev?: boolean, allowBuilds?: readonly string[] }} [options]
 * @returns {Promise<{ command: string, warnings: string[] }>} the command that
 *   ran, and anything the user has to settle themselves
 */
export async function installPackages(
	ctx,
	project,
	names,
	{ dev = false, allowBuilds: approved = [] } = {},
) {
	const run = async (/** @type {readonly string[]} */ allowBuilds) => {
		const { manager, args } = installCommand(project, names, dev, { allowBuilds });
		const result = await ctx.exec.run(manager, args, { cwd: project.root });
		return { result, command: `${manager} ${args.join(' ')}` };
	};

	let { result, command } = await run(approved);
	let output = `${result.stdout}\n${result.stderr}`;

	// `--allow-build` landed in pnpm 10.4. Older pnpm rejects the flag instead of
	// installing, and asking it for its version first would cost a process on
	// every run to spare one retry on almost none of them.
	if (result.code !== 0 && /Unknown option.*allow-build/i.test(output)) {
		({ result, command } = await run([]));
		output = `${result.stdout}\n${result.stderr}`;
	}

	if (result.code !== 0) {
		// A blocked build script is reported by failing after the packages are
		// already installed. Carrying on beats aborting: the install did its job,
		// and stopping here would skip the rest of the setup over a decision that
		// is the user's to make.
		if (output.includes(IGNORED_BUILDS)) return { command, warnings: [APPROVE_BUILDS] };
		throw new CliError(`\`${command}\` failed.`, {
			hint: (result.stderr || result.stdout).trim() || 'Install the packages by hand.',
		});
	}
	return { command, warnings: [] };
}
