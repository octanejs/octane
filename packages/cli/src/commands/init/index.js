import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { defineCommand } from '../../kernel/command.js';
import { setCompilerOption } from '../../kernel/edit.js';
import { CliError, EXIT } from '../../kernel/errors.js';
import { installPackages } from '../../kernel/install.js';
import {
	MODES,
	SCRIPTS,
	VITE_SCRIPTS,
	appComponent,
	integrationFor,
	octaneConfig,
	tsconfig,
	viteConfig,
} from './templates.js';

/**
 * @typedef {Object} Change
 * @property {string} file relative to the project root
 * @property {string} summary
 * @property {() => void} apply
 */

/**
 * Refuse to rewrite a project with uncommitted work in it, so `git diff` stays
 * a usable way to review what init did.
 *
 * @param {import('../../kernel/context.js').Ctx} ctx
 * @returns {Promise<boolean>} true when the tree is dirty
 */
async function isDirty(ctx) {
	if (!ctx.exec.which('git')) return false;
	const result = await ctx.exec.run('git', ['status', '--porcelain'], { cwd: ctx.cwd });
	return result.code === 0 && result.stdout.trim() !== '';
}

/**
 * @param {string} file
 * @param {string} body
 * @returns {() => void}
 */
const writeFile = (file, body) => () => {
	mkdirSync(path.dirname(file), { recursive: true });
	writeFileSync(file, body);
};

/**
 * @param {import('../../kernel/project.js').Project} project
 * @param {keyof typeof MODES} mode
 * @param {ReturnType<typeof integrationFor>} integration
 * @returns {{ changes: Change[], manual: string[] }}
 */
function plan(project, mode, integration) {
	const { root } = project;
	/** @type {Change[]} */
	const changes = [];
	/** @type {string[]} */
	const manual = [];
	const at = (/** @type {string} */ file) => path.join(root, file);

	if (!project.tsconfig) {
		changes.push({
			file: 'tsconfig.json',
			summary: 'create, configured for .tsrx',
			apply: writeFile(at('tsconfig.json'), `${JSON.stringify(tsconfig, null, 2)}\n`),
		});
	} else {
		const file = project.tsconfig.path;
		const options = project.tsconfig.config.compilerOptions ?? {};
		/** @type {[string, unknown][]} */
		const needed = [];
		if (options.jsxImportSource !== 'octane') needed.push(['jsxImportSource', 'octane']);
		if (!Array.isArray(options.plugins))
			needed.push(['plugins', [{ name: '@tsrx/typescript-plugin' }]]);
		else if (
			!options.plugins.some((/** @type {any} */ p) => p?.name === '@tsrx/typescript-plugin')
		) {
			manual.push('Add { "name": "@tsrx/typescript-plugin" } to compilerOptions.plugins.');
		}

		if (needed.length > 0) {
			changes.push({
				file: path.relative(root, file),
				summary: `set ${needed.map(([key]) => key).join(', ')}`,
				apply() {
					let text = readFileSync(file, 'utf8');
					for (const [key, value] of needed) {
						const edited = setCompilerOption(text, key, value);
						if (!edited) throw new CliError(`Could not edit ${path.basename(file)} safely.`);
						text = edited.text;
					}
					writeFileSync(file, text);
				},
			});
		}
	}

	const bundlerConfigPath = project.bundlerConfigPath ?? at('vite.config.ts');
	if (!project.bundlerConfigPath) {
		changes.push({
			file: 'vite.config.ts',
			summary: `create, registering ${integration.specifier}`,
			apply: writeFile(bundlerConfigPath, viteConfig(mode)),
		});
	} else if (!readFileSync(bundlerConfigPath, 'utf8').includes(integration.specifier)) {
		// Rewriting an arbitrary bundler config is guesswork; state the exact
		// edit instead of attempting it. The specifier is the one for THIS
		// project's bundler, not the Vite plugin init would otherwise scaffold.
		manual.push(
			`In ${path.relative(root, bundlerConfigPath)}, add: import { octane } from '${integration.specifier}';`,
			'then include octane() in the plugins array.',
		);
	}

	// init only knows how to scaffold Vite. On another bundler it still does the
	// parts that are correct everywhere (tsconfig, the right plugin, the right
	// dependency) and states the rest, rather than writing an octane.config.ts
	// whose import does not resolve or `vite` scripts with no vite installed.
	// @octanejs/rspack-plugin in particular exports no defineConfig/RenderRoute:
	// it is the low-level integration where the app owns its own shell.
	const scaffoldsVite = project.bundler === null || project.bundler === 'vite';

	if (mode === 'fullstack' && !scaffoldsVite) {
		manual.push(
			`Add an octane.config.ts for ${project.bundler}: see https://octanejs.dev/docs/build-tools`,
		);
	}

	if (mode === 'fullstack' && scaffoldsVite) {
		if (!project.octaneConfigPath) {
			changes.push({
				file: 'octane.config.ts',
				summary: 'create, with one route at /',
				apply: writeFile(at('octane.config.ts'), octaneConfig),
			});
		}
		if (!existsSync(at('src/App.tsrx'))) {
			changes.push({
				file: 'src/App.tsrx',
				summary: 'create the route entry referenced by octane.config.ts',
				apply: writeFile(at('src/App.tsrx'), appComponent),
			});
		}
	}

	const scripts = project.manifest.scripts ?? {};
	const applicable = scaffoldsVite ? { ...VITE_SCRIPTS, ...SCRIPTS } : SCRIPTS;
	const missing = Object.entries(applicable).filter(([name]) => !scripts[name]);
	if (missing.length > 0) {
		changes.push({
			file: 'package.json',
			summary: `add scripts: ${missing.map(([name]) => name).join(', ')}`,
			apply() {
				const manifest = JSON.parse(readFileSync(at('package.json'), 'utf8'));
				manifest.scripts = { ...manifest.scripts, ...Object.fromEntries(missing) };
				writeFileSync(at('package.json'), `${JSON.stringify(manifest, null, 2)}\n`);
			},
		});
	}

	return { changes, manual };
}

export default defineCommand({
	requiresProject: true,
	description:
		'Wire Octane into the project in this directory: the bundler plugin, the TypeScript\n' +
		'settings .tsrx needs, the scripts, and the dependencies.',
	flags: {
		mode: {
			type: 'string',
			choices: Object.keys(MODES),
			placeholder: '<mode>',
			description: 'spa for a client-only app, fullstack for routing and SSR.',
		},
		install: {
			type: 'boolean',
			default: true,
			description: 'Install dependencies (--no-install skips).',
		},
		force: { type: 'boolean', description: 'Proceed even with uncommitted changes.' },
	},

	async run(ctx, input) {
		const project = ctx.project();

		if (!input.flags.force && !ctx.dryRun && (await isDirty(ctx))) {
			throw new CliError('This project has uncommitted changes.', {
				hint: 'Commit or stash first so you can review what init writes, or pass --force.',
			});
		}

		const mode = /** @type {keyof typeof MODES} */ (
			input.flags.mode ??
				(await ctx.ui.select({
					message: 'What are you building?',
					flag: '--mode',
					initial: 'spa',
					options: Object.entries(MODES).map(([value, entry]) => ({
						value,
						label: entry.label,
						hint: entry.hint,
					})),
				}))
		);

		const integration = integrationFor(project.bundler, mode);
		const { changes, manual } = plan(project, mode, integration);
		const declared = project.declaredDependencies;
		const dependencies = integration.dependencies.filter((name) => !declared[name]);
		const devDependencies = integration.devDependencies.filter((name) => !declared[name]);

		ctx.ui.intro('octane init');

		if (changes.length === 0 && dependencies.length === 0 && devDependencies.length === 0) {
			ctx.ui.outro('Already set up. Run `octane doctor` to confirm.');
			return { json: { ok: true, mode, changes: [], installed: [] } };
		}

		ctx.ui.note(
			ctx.dryRun ? 'Would change' : 'Will change',
			changes.length > 0
				? changes.map((c) => `${c.file}  ${ctx.ui.colors.dim(c.summary)}`)
				: ['nothing'],
		);
		if (dependencies.length + devDependencies.length > 0) {
			ctx.ui.note('Will install', [
				...dependencies,
				...devDependencies.map((name) => `${name} (dev)`),
			]);
		}

		if (ctx.dryRun) {
			return {
				json: { ok: true, dryRun: true, mode, changes: changes.map((c) => c.file), manual },
			};
		}

		const confirmed = await ctx.ui.confirm({ message: 'Apply?', flag: '--yes', initial: true });
		if (!confirmed)
			return { exitCode: EXIT.OK, json: { ok: true, mode, changes: [], installed: [] } };

		for (const change of changes) change.apply();

		/** @type {string[]} */
		const installed = [];
		if (input.flags.install && dependencies.length + devDependencies.length > 0) {
			const spinner = ctx.ui.spinner(`Installing with ${project.packageManager ?? 'npm'}`);
			try {
				for (const [names, dev] of [
					[dependencies, false],
					[devDependencies, true],
				]) {
					if (/** @type {string[]} */ (names).length === 0) continue;
					await installPackages(ctx, project, /** @type {string[]} */ (names), {
						dev: Boolean(dev),
					});
					installed.push(.../** @type {string[]} */ (names));
				}
			} catch (error) {
				spinner.stop('Install failed');
				throw error;
			}
			spinner.stop(`Installed ${installed.length} package(s)`);
		} else if (dependencies.length + devDependencies.length > 0) {
			manual.push(`Install: ${[...dependencies, ...devDependencies].join(' ')}`);
		}

		if (manual.length > 0) ctx.ui.note('Do this by hand', manual);
		ctx.ui.outro('Run `octane doctor` to verify the result.');

		return {
			json: { ok: true, mode, changes: changes.map((c) => c.file), installed, manual },
		};
	},
});
