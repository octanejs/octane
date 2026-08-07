import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { defineCommand } from '../../kernel/command.js';
import { setCompilerOption } from '../../kernel/edit.js';
import { CliError, EXIT } from '../../kernel/errors.js';
import { PACKAGE_MANAGERS, PNPM_ALLOWED_BUILDS, installPackages } from '../../kernel/install.js';
import {
	MODES,
	PRETTIER_CONFIG_FILES,
	SCRIPTS,
	SSR_MARKERS,
	VITE_SCRIPTS,
	appComponent,
	clientEntry,
	counterComponent,
	globalStyles,
	healthRoute,
	indexHtml,
	integrationFor,
	layoutComponent,
	octaneConfig,
	prettierConfig,
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
 * Where a project keeps its Prettier settings, and what they say, so a caller
 * can tell whether the plugin is already registered there.
 *
 * The `prettier` field of package.json holds either the settings themselves or
 * a path to them, and the two have to be read differently. `declared` is null
 * when the settings are real but out of reach: the field may name a shareable
 * config, and resolving a bare module specifier is the package manager's job.
 *
 * @param {string} root
 * @param {string[]} files config files found in the project, in Prettier's search order
 * @param {unknown} fromManifest the `prettier` field of package.json
 * @returns {{ where: string, declared: string | null }}
 */
function prettierSettings(root, files, fromManifest) {
	// package.json comes first in Prettier's own search order, ahead of every
	// config file, so when a project has both it is the field that decides. Read
	// the file instead and init can approve a config Prettier never loads.
	if (fromManifest === undefined) {
		return { where: files[0], declared: readFileSync(path.join(root, files[0]), 'utf8') };
	}
	if (typeof fromManifest !== 'string') {
		return {
			where: 'the prettier field of package.json',
			declared: JSON.stringify(fromManifest),
		};
	}
	// A path is relative to the package.json naming it. Anything that does not
	// land on a file is a specifier for the resolver, not a path.
	const file = path.resolve(root, fromManifest);
	return existsSync(file) && statSync(file).isFile()
		? { where: path.relative(root, file), declared: readFileSync(file, 'utf8') }
		: { where: fromManifest, declared: null };
}

/**
 * The TypeScript range `tsrx-tsc` will start under, read from the plugin that
 * ships it once that plugin is on disk.
 *
 * It is a required peer there, not a dependency, so nothing carries a compiler
 * of its own. npm and pnpm install a required peer themselves; yarn does not,
 * and leaves a project whose `typecheck` script dies on `Cannot find module
 * 'typescript'`. Naming the package with no range is not the fix either: that
 * takes the newest major, which `tsrx-tsc` cannot start under. So the range
 * comes from the toolchain's own declaration, never from a guess here.
 *
 * @param {string} root
 * @returns {string | null} null when the plugin is not installed yet
 */
function toolchainTypescriptRange(root) {
	try {
		const manifest = JSON.parse(
			readFileSync(path.join(root, 'node_modules/@tsrx/typescript-plugin/package.json'), 'utf8'),
		);
		const range = manifest.peerDependencies?.typescript;
		return typeof range === 'string' && range !== '' ? range : null;
	} catch {
		return null;
	}
}

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
			apply: writeFile(at('tsconfig.json'), tsconfig),
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

	// Formatting is nobody's bundler's business, so this runs whichever one the
	// project uses. Without the plugin Prettier cannot parse `.tsrx` at all.
	const prettierFiles = PRETTIER_CONFIG_FILES.filter((file) => existsSync(at(file)));
	if (prettierFiles.length === 0 && project.manifest.prettier === undefined) {
		changes.push({
			file: '.prettierrc',
			summary: 'create, registering @tsrx/prettier-plugin',
			apply: writeFile(at('.prettierrc'), prettierConfig),
		});
	} else {
		// Their config is theirs, and it can be JSON, YAML, or JavaScript. Reading
		// it as text is enough to tell whether the plugin is already named, which
		// is all that decides between staying quiet and stating the edit.
		const { where, declared } = prettierSettings(root, prettierFiles, project.manifest.prettier);
		if (declared === null) {
			// Saying "add it" would be a guess, and so would saying nothing.
			manual.push(
				`Prettier settings come from ${where}, which this command cannot read: check that "@tsrx/prettier-plugin" is among its plugins.`,
			);
		} else if (!declared.includes('@tsrx/prettier-plugin')) {
			manual.push(`Add "@tsrx/prettier-plugin" to the Prettier plugins in ${where}.`);
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

	if (scaffoldsVite) {
		if (mode === 'fullstack' && !project.octaneConfigPath) {
			changes.push({
				file: 'octane.config.ts',
				summary: 'create, with routes for /, /counter, and GET /api/health',
				apply: writeFile(at('octane.config.ts'), octaneConfig),
			});
		}

		// Without a shell and an entry there is nothing to serve: `vite` has no
		// page to open and a fullstack build fails outright, because the plugin
		// requires an index.html once octane.config.ts declares routes. Each file
		// is written only when it is absent, so an existing project keeps its own.
		const writesShell = !existsSync(at('index.html'));
		// spa is plain Vite, so the page loads the entry itself and the two files
		// only make sense together. fullstack needs no entry here: the plugin
		// injects hydration, in dev through its middleware and in production at
		// transformIndexHtml.
		// Guarded like every other file here: a project can have lost its
		// index.html and still own the entry that used to be loaded from it.
		const writesClientEntry = writesShell && mode === 'spa' && !existsSync(at('src/main.ts'));
		if (writesShell) {
			changes.push({
				file: 'index.html',
				summary:
					mode === 'fullstack' ? 'create, carrying the SSR markers' : 'create, loading src/main.ts',
				apply: writeFile(at('index.html'), indexHtml(mode)),
			});
			if (writesClientEntry) {
				changes.push({
					file: 'src/main.ts',
					summary: 'create, mounting App into #root',
					apply: writeFile(at('src/main.ts'), clientEntry),
				});
			}
		} else if (mode === 'fullstack') {
			// Their index.html is theirs to edit, and splicing markers into
			// arbitrary HTML is the same guesswork as rewriting a bundler config.
			const html = readFileSync(at('index.html'), 'utf8');
			const missing = SSR_MARKERS.filter((marker) => !html.includes(marker));
			if (missing.length > 0) {
				manual.push(`In index.html, add ${missing.join(' and ')}: SSR renders into those markers.`);
			}
		}

		// The pages belong to the routes this run declares, so they follow the
		// octane.config.ts written above and are not written into a project that
		// brought its own. That config names its own entries, which may not be
		// these files at all; writing them there produces components nothing
		// routes to, and a shared layout whose nav links 404 because the routes
		// behind them were never declared. A missing entry in someone's own config
		// is a real problem, but it is `octane doctor`'s to report, not this
		// command's to paper over with a page they did not ask for.
		const scaffoldsRoutes = mode === 'fullstack' && !project.octaneConfigPath;
		// spa needs the component only alongside the entry that imports it, so a
		// project with its own page does not collect an orphan component. That is
		// the entry this run writes, not the shell: keeping someone's src/main.ts
		// means keeping whatever it imports, which is not this file.
		const writesApp = (scaffoldsRoutes || writesClientEntry) && !existsSync(at('src/App.tsrx'));
		const writesCounter = scaffoldsRoutes && !existsSync(at('src/Counter.tsrx'));
		// Both fullstack pages import the layout, so it follows whichever of them
		// this run writes: writing one of those pages without it would scaffold an
		// app whose own import does not resolve.
		const writesLayout =
			mode === 'fullstack' && (writesApp || writesCounter) && !existsSync(at('src/Layout.tsrx'));

		// The components this run scaffolds, in the order the app reads: the entry,
		// the frame it renders through, then the second page. Collected as a list
		// rather than pushed one `if` at a time because the stylesheet below is
		// derived from it — every one of these reads the theme tokens, and a
		// second enumeration saying which ones do has been wrong every time it was
		// written. Adding a page here cannot forget to bring the tokens with it.
		const pages = [];
		if (writesApp) {
			pages.push({
				file: 'src/App.tsrx',
				summary:
					mode === 'fullstack'
						? 'create the route entry referenced by octane.config.ts'
						: 'create the entry component',
				body: appComponent(mode),
			});
		}
		if (writesLayout) {
			pages.push({
				file: 'src/Layout.tsrx',
				summary: 'create the frame both pages share',
				body: layoutComponent,
			});
		}
		if (writesCounter) {
			pages.push({
				file: 'src/Counter.tsrx',
				summary: 'create the route entry for /counter',
				body: counterComponent,
			});
		}
		for (const page of pages) {
			changes.push({
				file: page.file,
				summary: page.summary,
				apply: writeFile(at(page.file), page.body),
			});
		}

		// Not a page: it renders nothing and reads no tokens, so it is deliberately
		// outside the list above.
		if (scaffoldsRoutes && !existsSync(at('src/server/health.ts'))) {
			changes.push({
				file: 'src/server/health.ts',
				summary: 'create the handler for GET /api/health',
				apply: writeFile(at('src/server/health.ts'), healthRoute),
			});
		}
		// The reset and theme tokens, which two separate things depend on: the
		// shell links the file, and every component above reads the tokens in it.
		// Either one alone is enough to need it, and they do not imply each other —
		// this command writes pages without a shell when the project has its own
		// `index.html`, and writes a shell without pages when the project has its
		// own routing. Tying the stylesheet to just one of them leaves the other
		// side broken: a page whose every colour, border and surface resolves to
		// nothing, or a shell linking a file that was never created.
		if ((writesShell || pages.length > 0) && !existsSync(at('src/styles.css'))) {
			changes.push({
				file: 'src/styles.css',
				summary: 'create the reset and the theme tokens',
				apply: writeFile(at('src/styles.css'), globalStyles),
			});
			// The shell this command writes carries the tag. When the project
			// brought its own, splicing one into it is the same guesswork as
			// rewriting their bundler config, so state the line instead.
			if (!writesShell) {
				manual.push(
					'In index.html, add <link rel="stylesheet" href="/src/styles.css" />: the scaffolded pages read their theme tokens from it.',
				);
			}
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

/**
 * Wire Octane into the project at `project.root`: plan the files, report them,
 * apply them, install what is missing.
 *
 * Shared with `octane create`, which is the same work against a directory it
 * has just made rather than one that was already there. Driving this from
 * outside, by re-entering `main` with an argv, meant a second copy of every
 * question about whether the CLI can prompt; one `ctx` removes that.
 *
 * @param {import('../../kernel/context.js').Ctx} ctx
 * @param {import('../../kernel/project.js').Project} project
 * @param {{ title: string, mode?: string, modeFlag?: string, install?: boolean,
 *   packageManager?: string }} options
 * @returns {Promise<{ exitCode?: number, json: Record<string, unknown> }>}
 */
export async function applyInit(ctx, project, options) {
	const mode = /** @type {keyof typeof MODES} */ (
		options.mode ??
			(await ctx.ui.select({
				message: 'What are you building?',
				flag: options.modeFlag ?? '--mode',
				initial: 'spa',
				options: Object.entries(MODES).map(([value, entry]) => ({
					value,
					label: entry.label,
					hint: entry.hint,
				})),
			}))
	);

	// Detection reads a lockfile, and a project that has never been installed
	// has none to read. A caller that knows which manager it was invoked
	// through can say so, rather than watching the fallback write the wrong
	// kind of lockfile into a brand-new project.
	const installing =
		options.packageManager === undefined
			? project
			: {
					...project,
					packageManager: /** @type {typeof project.packageManager} */ (options.packageManager),
				};

	const integration = integrationFor(project.bundler, mode);
	const { changes, manual } = plan(project, mode, integration);
	const declared = project.declaredDependencies;
	const dependencies = integration.dependencies.filter((name) => !declared[name]);
	const devDependencies = integration.devDependencies.filter((name) => !declared[name]);

	ctx.ui.intro(options.title);

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
		return { json: { ok: true, dryRun: true, mode, changes: changes.map((c) => c.file), manual } };
	}

	const confirmed = await ctx.ui.confirm({ message: 'Apply?', flag: '--yes', initial: true });
	if (!confirmed)
		return { exitCode: EXIT.OK, json: { ok: true, mode, changes: [], installed: [] } };

	for (const change of changes) change.apply();

	/** @type {string[]} */
	const installed = [];
	// Every install in this run hits the same blocked build script, and the same
	// line three times reads like three problems.
	const warn = (/** @type {string[]} */ lines) => {
		for (const line of lines) if (!manual.includes(line)) manual.push(line);
	};
	if (options.install !== false && dependencies.length + devDependencies.length > 0) {
		const spinner = ctx.ui.spinner(`Installing with ${installing.packageManager ?? 'npm'}`);
		try {
			for (const [names, dev] of [
				[dependencies, false],
				[devDependencies, true],
			]) {
				if (/** @type {string[]} */ (names).length === 0) continue;
				const ran = await installPackages(ctx, installing, /** @type {string[]} */ (names), {
					dev: Boolean(dev),
					allowBuilds: PNPM_ALLOWED_BUILDS,
				});
				warn(ran.warnings);
				installed.push(.../** @type {string[]} */ (names));
			}

			// Now that the plugin is on disk it can say which TypeScript it runs
			// under. A package manager that installs required peers has already
			// put one there and this pins the same range explicitly; one that does
			// not, like yarn, would otherwise leave `typecheck` unable to start.
			if (!declared.typescript) {
				const range = toolchainTypescriptRange(project.root);
				if (range === null) {
					manual.push('Install typescript, at the range @tsrx/typescript-plugin declares.');
				} else {
					const ran = await installPackages(ctx, installing, [`typescript@${range}`], {
						dev: true,
						allowBuilds: PNPM_ALLOWED_BUILDS,
					});
					warn(ran.warnings);
					installed.push('typescript');
				}
			}
		} catch (error) {
			spinner.stop('Install failed');
			throw error;
		}
		spinner.stop(`Installed ${installed.length} package(s)`);
	} else if (dependencies.length + devDependencies.length > 0) {
		// The range lives in the plugin, which is not installed yet, so it cannot
		// be quoted here. Naming the package without one would send people to the
		// newest major, which `tsrx-tsc` cannot start under.
		manual.push(
			`Install: ${[...dependencies, ...devDependencies].join(' ')}`,
			'then typescript, at the range @tsrx/typescript-plugin declares as its peer.',
		);
	}

	if (manual.length > 0) ctx.ui.note('Do this by hand', manual);
	ctx.ui.outro('Run `octane doctor` to verify the result.');

	return { json: { ok: true, mode, changes: changes.map((c) => c.file), installed, manual } };
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
		'package-manager': {
			type: 'string',
			choices: PACKAGE_MANAGERS,
			placeholder: '<name>',
			description: 'Install with this one instead of the project’s own.',
		},
		force: { type: 'boolean', description: 'Proceed even with uncommitted changes.' },
	},

	async run(ctx, input) {
		if (!input.flags.force && !ctx.dryRun && (await isDirty(ctx))) {
			throw new CliError('This project has uncommitted changes.', {
				hint: 'Commit or stash first so you can review what init writes, or pass --force.',
			});
		}

		return applyInit(ctx, ctx.project(), {
			title: 'octane init',
			mode: input.flags.mode,
			install: input.flags.install,
			packageManager: input.flags['package-manager'],
		});
	},
});
