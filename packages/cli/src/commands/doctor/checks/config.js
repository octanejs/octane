import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { readInstalled } from '../../../kernel/project.js';
import { fail, pass, skip, warn } from '../check.js';

const ADAPTERS = {
	vercel: '@octanejs/adapter-vercel',
	cloudflare: '@octanejs/adapter-cloudflare',
};

/**
 * Load the project's own config loader rather than shipping a second one.
 *
 * `@octanejs/app-core` is usually a transitive dependency of the bundler
 * plugin, not a direct one, so a plain resolve from the project root misses it.
 * Falling back to a resolve rooted at the plugin reproduces exactly the lookup
 * the plugin itself performs.
 *
 * @param {string} root
 * @returns {Promise<((root: string) => Promise<any>) | null>}
 */
async function resolveConfigLoader(root) {
	const fromProject = createRequire(path.join(root, 'noop.js'));
	const specifier = '@octanejs/app-core/config-loader';

	/** @type {string | null} */
	let entry = null;
	try {
		entry = fromProject.resolve(specifier);
	} catch {
		for (const plugin of [
			'@octanejs/vite-plugin',
			'@octanejs/rspack-plugin',
			'@octanejs/rsbuild-plugin',
		]) {
			try {
				entry = createRequire(fromProject.resolve(plugin)).resolve(specifier);
				break;
			} catch {
				// Try the next plugin.
			}
		}
	}

	if (!entry) return null;
	const module = await import(pathToFileURL(entry).href);
	return module.loadOctaneConfig ?? null;
}

/**
 * Loading the config means running esbuild over `octane.config.ts`. All three
 * config checks need the same result, so it is computed once instead of three
 * times per `doctor` run.
 *
 * Keyed on the project object rather than its path: `ctx.refreshProject()`
 * hands out a new object after `--fix` writes, so a refreshed project reloads
 * instead of serving a stale parse, and the entry dies with the project.
 *
 * @type {WeakMap<object, Promise<{ config: any } | { error: string }>>}
 */
const loaded = new WeakMap();

/**
 * @param {import('../../../kernel/project.js').Project} project
 * @returns {Promise<{ config: any } | { error: string }>}
 */
function loadConfig(project) {
	let pending = loaded.get(project);
	if (!pending) {
		pending = (async () => {
			const load = await resolveConfigLoader(project.root);
			if (!load) return { error: 'unresolved' };
			try {
				return { config: await load(project.root) };
			} catch (error) {
				return { error: error instanceof Error ? error.message : String(error) };
			}
		})();
		loaded.set(project, pending);
	}
	return pending;
}

/**
 * Evaluating `octane.config.ts` means executing it, and it imports the very
 * packages a not-yet-installed project is missing. Reporting that as a config
 * error would just restate `deps.octane-installed` in a more confusing way.
 *
 * @type {(project: import('../../../kernel/project.js').Project) => boolean}
 */
const hasOctaneConfig = (project) =>
	project.octaneConfigPath !== null && readInstalled(project.root, 'octane') !== null;

/** @type {import('../check.js').Check[]} */
export const configChecks = [
	{
		id: 'config.loads',
		title: 'octane.config loads',
		category: 'config',
		severity: 'error',
		applies: hasOctaneConfig,
		async run(ctx, project) {
			const file = path.basename(/** @type {string} */ (project.octaneConfigPath));
			const loaded = await loadConfig(project);

			if ('error' in loaded) {
				return loaded.error === 'unresolved'
					? skip('@octanejs/app-core is not installed, so the config was not evaluated')
					: fail(`${file} failed to load`, { detail: [loaded.error] });
			}

			const routes = loaded.config.router?.routes ?? [];
			return pass(`${file} loads with ${routes.length} route(s)`);
		},
	},
	{
		id: 'config.routes-resolve',
		title: 'Route entries',
		category: 'config',
		severity: 'error',
		applies: hasOctaneConfig,
		async run(ctx, project) {
			const loaded = await loadConfig(project);
			if ('error' in loaded) return skip('The config could not be evaluated');

			const routes = loaded.config.router?.routes ?? [];
			if (routes.length === 0) return skip('The config declares no routes');

			/** @type {string[]} */
			const problems = [];
			/** @type {Map<string, number>} */
			const seen = new Map();

			for (const route of routes) {
				const entry = Array.isArray(route.entry) ? route.entry[1] : route.entry;
				if (typeof entry === 'string' && !existsSync(path.join(project.root, entry))) {
					problems.push(`${route.path} points at a missing entry: ${entry}`);
				}
				seen.set(route.path, (seen.get(route.path) ?? 0) + 1);
			}

			for (const [routePath, count] of seen) {
				if (count > 1) problems.push(`${routePath} is declared ${count} times`);
			}

			const preHydrate = loaded.config.router?.preHydrate;
			if (typeof preHydrate === 'string' && !existsSync(path.join(project.root, preHydrate))) {
				problems.push(`preHydrate points at a missing file: ${preHydrate}`);
			}

			return problems.length === 0
				? pass(`${routes.length} route entr(ies) resolve`)
				: fail(`${problems.length} route problem(s)`, {
						detail: problems.map((line) => `  ${line}`),
					});
		},
	},
	{
		id: 'config.adapter-installed',
		title: 'Deployment adapter',
		category: 'config',
		severity: 'warning',
		applies: hasOctaneConfig,
		async run(ctx, project) {
			const loaded = await loadConfig(project);
			if ('error' in loaded) return skip('The config could not be evaluated');

			const adapter = loaded.config.adapter;
			const name = typeof adapter === 'string' ? adapter : adapter?.name;
			if (!name) return skip('No deployment adapter configured');

			const expected = ADAPTERS[/** @type {keyof typeof ADAPTERS} */ (name)];
			if (!expected) return pass(`Adapter "${name}"`);

			return readInstalled(project.root, expected)
				? pass(`Adapter "${name}" (${expected})`)
				: warn(`Adapter "${name}" is configured but ${expected} is not installed`, {
						detail: [`Add it with: pnpm add -D ${expected}`],
					});
		},
	},
];
