import path from 'node:path';
import { findCopies, readInstalled } from '../../../kernel/project.js';
import { satisfies } from '../../../kernel/semver.js';
import { fail, pass, skip, warn } from '../check.js';

/** @type {import('../check.js').Check[]} */
export const dependencyChecks = [
	{
		id: 'deps.octane-installed',
		title: 'Octane runtime',
		category: 'dependencies',
		severity: 'error',
		run(ctx, project) {
			const installed = readInstalled(project.root, 'octane');
			if (installed) return pass(`octane ${installed.version}`);
			return fail('octane is not installed', {
				detail: [
					project.declaredDependencies.octane
						? 'It is declared in package.json but missing from node_modules. Install dependencies.'
						: 'Add it with: pnpm add octane',
				],
			});
		},
	},
	{
		id: 'deps.octane-duplicates',
		title: 'Single Octane runtime',
		category: 'dependencies',
		severity: 'error',
		run(ctx, project) {
			const copies = findCopies(project.root, 'octane');
			if (copies.length <= 1) return pass('One copy of octane in the tree');

			return fail(`${copies.length} copies of octane are installed`, {
				detail: [
					'Hooks and context are keyed per runtime instance, so a second copy breaks',
					'them without raising an error. Deduplicate before debugging anything else.',
					...copies.map((copy) => `  ${copy.version} via ${copy.via} (${copy.realPath})`),
				],
			});
		},
	},
	{
		id: 'deps.vite-peer',
		title: 'Vite peer range',
		category: 'dependencies',
		severity: 'error',
		applies: (project) => project.bundler === 'vite',
		run(ctx, project) {
			const octane = readInstalled(project.root, 'octane');
			const vite = readInstalled(project.root, 'vite');
			if (!octane || !vite) return skip('octane or vite is not installed');

			const range = octane.manifest.peerDependencies?.vite;
			if (!range) return skip('octane declares no vite peer');

			const ok = satisfies(vite.version, range);
			if (ok === null) return warn(`Could not evaluate vite ${vite.version} against "${range}"`);
			return ok
				? pass(`vite ${vite.version} satisfies ${range}`)
				: fail(`vite ${vite.version} does not satisfy octane's peer range ${range}`, {
						detail: [`Install a matching Vite: pnpm add -D vite@"${range}"`],
					});
		},
	},
	{
		id: 'deps.binding-peers',
		title: 'Binding peer ranges',
		category: 'dependencies',
		severity: 'error',
		applies: (project) => project.bindings.length > 0,
		run(ctx, project) {
			const octane = readInstalled(project.root, 'octane');
			if (!octane) return skip('octane is not installed');

			/** @type {string[]} */
			const mismatched = [];
			let checked = 0;

			for (const name of project.bindings) {
				const binding = readInstalled(project.root, name);
				const range = binding?.manifest.peerDependencies?.octane;
				if (!range) continue;
				const ok = satisfies(octane.version, range);
				if (ok === null) continue;
				checked++;
				if (!ok) mismatched.push(`${name}@${binding.version} wants octane ${range}`);
			}

			if (mismatched.length > 0) {
				return fail(`${mismatched.length} binding(s) disagree with octane ${octane.version}`, {
					detail: mismatched.map((line) => `  ${line}`),
				});
			}
			return checked > 0
				? pass(`${checked} binding(s) agree with octane ${octane.version}`)
				: skip('No binding declares a comparable octane peer range');
		},
	},
	{
		id: 'deps.tsrx-toolchain',
		title: 'TSRX toolchain',
		category: 'dependencies',
		severity: 'error',
		applies: (project) => project.tsrxFiles.length > 0,
		run(ctx, project) {
			if (readInstalled(project.root, '@tsrx/typescript-plugin')) {
				return pass('@tsrx/typescript-plugin is installed');
			}
			const sample = path.relative(project.root, project.tsrxFiles[0]);
			return fail('@tsrx/typescript-plugin is not installed', {
				detail: [
					`This project has ${project.tsrxFiles.length} .tsrx file(s), starting with ${sample}.`,
					'It supplies the tsrx-tsc binary and the editor language service.',
					'Add it with: pnpm add -D @tsrx/typescript-plugin',
				],
			});
		},
	},
];
