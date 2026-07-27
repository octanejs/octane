import { CliError } from './errors.js';

/** How each package manager spells "add a dependency". */
const MANAGERS = {
	pnpm: { add: ['add'], dev: '-D' },
	npm: { add: ['install'], dev: '--save-dev' },
	yarn: { add: ['add'], dev: '-D' },
	bun: { add: ['add'], dev: '-d' },
};

/**
 * @param {import('./project.js').Project} project
 * @param {string[]} names
 * @param {boolean} dev
 * @returns {{ manager: string, args: string[] }}
 */
export function installCommand(project, names, dev = false) {
	const manager = project.packageManager ?? 'npm';
	const recipe = MANAGERS[/** @type {keyof typeof MANAGERS} */ (manager)] ?? MANAGERS.npm;
	return { manager, args: [...recipe.add, ...(dev ? [recipe.dev] : []), ...names] };
}

/**
 * Install through the project's own package manager, which owns version
 * resolution. The CLI never invents a version range.
 *
 * @param {import('./context.js').Ctx} ctx
 * @param {import('./project.js').Project} project
 * @param {string[]} names
 * @param {{ dev?: boolean }} [options]
 * @returns {Promise<string>} the command that ran
 */
export async function installPackages(ctx, project, names, { dev = false } = {}) {
	const { manager, args } = installCommand(project, names, dev);
	const result = await ctx.exec.run(manager, args, { cwd: project.root });

	if (result.code !== 0) {
		throw new CliError(`\`${manager} ${args.join(' ')}\` failed.`, {
			hint: (result.stderr || result.stdout).trim() || 'Install the packages by hand.',
		});
	}
	return `${manager} ${args.join(' ')}`;
}
