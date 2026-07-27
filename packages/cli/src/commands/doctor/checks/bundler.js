import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fail, pass, skip, warn } from '../check.js';

/**
 * The two supported ways to compile Octane, and how to recognise each in a
 * bundler config. `octane/compiler/*` compiles components only; the
 * `@octanejs/*-plugin` packages add routing, SSR, and the production build.
 */
const INTEGRATIONS = [
	{ specifier: 'octane/compiler/vite', mode: 'spa', bundler: 'vite' },
	{ specifier: 'octane/compiler/bundler', mode: 'spa', bundler: 'rspack' },
	{ specifier: '@octanejs/vite-plugin', mode: 'fullstack', bundler: 'vite' },
	{ specifier: '@octanejs/rspack-plugin', mode: 'fullstack', bundler: 'rspack' },
	{ specifier: '@octanejs/rsbuild-plugin', mode: 'fullstack', bundler: 'rsbuild' },
	{ specifier: '@octanejs/rspeedy-plugin', mode: 'fullstack', bundler: 'rspeedy' },
];

/**
 * @param {import('../../../kernel/project.js').Project} project
 * @returns {string | null}
 */
function readBundlerConfig(project) {
	if (!project.bundlerConfigPath) return null;
	try {
		return readFileSync(project.bundlerConfigPath, 'utf8');
	} catch {
		return null;
	}
}

/** @type {import('../check.js').Check[]} */
export const bundlerChecks = [
	{
		id: 'bundler.plugin-present',
		title: 'Octane bundler plugin',
		category: 'bundler',
		severity: 'error',
		run(ctx, project) {
			if (!project.bundlerConfigPath) {
				return project.tsrxFiles.length > 0
					? fail('No bundler config found', {
							detail: [
								'.tsrx files only compile through an Octane bundler plugin.',
								'Create a vite.config.ts that registers octane() from octane/compiler/vite.',
							],
						})
					: skip('No bundler config found');
			}

			const source = readBundlerConfig(project);
			if (source === null)
				return skip(`Could not read ${path.basename(project.bundlerConfigPath)}`);

			const matched = INTEGRATIONS.filter((entry) => source.includes(entry.specifier));
			const file = path.relative(project.root, project.bundlerConfigPath);

			if (matched.length === 0) {
				return fail(`No Octane plugin registered in ${file}`, {
					detail: [
						"For a client-only app:  import { octane } from 'octane/compiler/vite';",
						"For routing and SSR:    import { octane } from '@octanejs/vite-plugin';",
					],
				});
			}

			if (matched.length > 1) {
				return warn(`${matched.length} Octane integrations referenced in ${file}`, {
					detail: [
						'Register exactly one. The compiler plugin and the metaframework plugin both',
						'compile .tsrx, so running them together compiles every component twice.',
						...matched.map((entry) => `  ${entry.specifier}`),
					],
				});
			}

			const [only] = matched;
			return pass(
				only.mode === 'fullstack'
					? `${only.specifier} (routing, SSR, production build)`
					: `${only.specifier} (client-only compilation)`,
			);
		},
	},
	{
		id: 'bundler.build-target',
		title: 'Build target',
		category: 'bundler',
		severity: 'warning',
		applies: (project) => project.bundlerConfigPath !== null,
		run(ctx, project) {
			const source = readBundlerConfig(project);
			if (source === null) return skip('Could not read the bundler config');

			const match = /\btarget\s*:\s*['"]([^'"]+)['"]/.exec(source);
			if (!match) return skip('No explicit build target; the bundler default applies');
			if (match[1] === 'esnext') return pass('target is "esnext"');

			return warn(`Build target is "${match[1]}"`, {
				detail: ['Octane emits modern output; "esnext" avoids a redundant downlevel pass.'],
			});
		},
	},
];
