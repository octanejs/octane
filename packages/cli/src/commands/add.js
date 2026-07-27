import { defineCommand } from '../kernel/command.js';
import { BINDINGS, resolveBinding, searchBindings } from '../data/index.js';
import { EXIT, usageError } from '../kernel/errors.js';
import { installCommand, installPackages } from '../kernel/install.js';

/**
 * @typedef {Object} Resolution
 * @property {string} requested
 * @property {import('../data/index.js').Binding | null} binding
 * @property {'binding' | 'react-package'} [via]
 * @property {string[]} suggestions
 */

/**
 * @param {string} name
 * @returns {Resolution}
 */
function resolve(name) {
	const found = resolveBinding(name);
	if (found) return { requested: name, binding: found.binding, via: found.via, suggestions: [] };

	// Nothing ports this package. Offer the closest thing rather than a bare no.
	const stem = name.replace(/^@[^/]+\//, '').replace(/^react-|-react$/g, '');
	return {
		requested: name,
		binding: null,
		suggestions: searchBindings(stem, { surface: false })
			.slice(0, 3)
			.map((binding) => binding.name),
	};
}

export default defineCommand({
	requiresProject: true,
	description:
		'Install an Octane binding, by its own name or by the React package it ports, and\n' +
		'report the surface it supports and where it deliberately differs from upstream.',
	positionals: [
		{
			name: 'package',
			description: 'Binding or React package name.',
			required: true,
			variadic: true,
		},
	],
	flags: {
		install: {
			type: 'boolean',
			default: true,
			description: 'Install (--no-install just reports).',
		},
		dev: { type: 'boolean', description: 'Install as a devDependency.' },
	},

	async run(ctx, input) {
		if (input.positionals.length === 0) {
			throw usageError('Nothing to add.', 'Try: octane add @tanstack/react-query');
		}

		const project = ctx.project();
		const resolutions = input.positionals.map(resolve);
		const found = resolutions.filter((entry) => entry.binding !== null);
		const missing = resolutions.filter((entry) => entry.binding === null);

		ctx.ui.intro('octane add');

		for (const entry of missing) {
			ctx.ui.log(
				`  ${ctx.ui.colors.red('✖')} ${entry.requested} ${ctx.ui.colors.dim('has no Octane binding')}`,
			);
			if (entry.suggestions.length > 0) {
				ctx.ui.log(`      ${ctx.ui.colors.dim(`closest: ${entry.suggestions.join(', ')}`)}`);
			}
		}

		const names = [...new Set(found.map((entry) => /** @type {any} */ (entry.binding).name))];
		const toInstall = names.filter((name) => !project.declaredDependencies[name]);

		if (names.length > 0) {
			const { manager, args } = installCommand(
				project,
				toInstall.length > 0 ? toInstall : names,
				input.flags.dev,
			);

			if (ctx.dryRun || !input.flags.install) {
				ctx.ui.note('Would run', [`${manager} ${args.join(' ')}`]);
			} else if (toInstall.length === 0) {
				ctx.ui.log(`  ${ctx.ui.colors.dim('Already declared; nothing to install.')}`);
			} else {
				const spinner = ctx.ui.spinner(`Installing ${toInstall.join(', ')}`);
				const ran = await installPackages(ctx, project, toInstall, { dev: input.flags.dev });
				spinner.stop(ran);
			}
		}

		for (const entry of found) {
			const binding = /** @type {import('../data/index.js').Binding} */ (entry.binding);
			const heading =
				entry.via === 'react-package'
					? `${binding.name}  (ports ${entry.requested})`
					: binding.name;

			ctx.ui.note(heading, [
				binding.surface,
				...(binding.divergences.length > 0
					? ['', 'Differs from upstream:', ...binding.divergences.map((line) => `  - ${line}`)]
					: []),
			]);
		}

		const ok = missing.length === 0;
		ctx.ui.outro(
			ok
				? 'Run `octane doctor` to verify the result.'
				: `Run \`octane bindings\` to browse all ${BINDINGS.length}.`,
		);

		return {
			exitCode: ok ? EXIT.OK : EXIT.FAILURE,
			json: {
				ok,
				installed: ctx.dryRun || !input.flags.install ? [] : toInstall,
				resolved: found.map((entry) => ({
					requested: entry.requested,
					binding: /** @type {any} */ (entry.binding).name,
					via: entry.via,
					surface: /** @type {any} */ (entry.binding).surface,
					divergences: /** @type {any} */ (entry.binding).divergences,
				})),
				unavailable: missing.map((entry) => ({
					requested: entry.requested,
					suggestions: entry.suggestions,
				})),
			},
		};
	},
});
