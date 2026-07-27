import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fail, pass, skip, warn } from '../check.js';
import { findNestedProperty, setCompilerOption } from '../../../kernel/edit.js';

const TSRX_PLUGIN = '@tsrx/typescript-plugin';
const WILDCARD_DECL = /^\s*declare\s+module\s+['"]\*\.tsrx['"]/;
const LEGACY_RESOLUTION = new Set(['node', 'node10', 'classic']);
// `tsc` as its own command word. `\btsc\b` also matches the tail of `vue-tsc`
// and `svelte-tsc`, which would fail a healthy script and, under --fix, rewrite
// it to `vue-tsrx-tsc`. Quotes count as delimiters because the --fix path
// splices the raw JSON value, quotes included.
const BARE_TSC = /(^|[\s;&|("'])tsc(?=[\s;&|)"']|$)/;
const BARE_TSC_GLOBAL = new RegExp(BARE_TSC.source, 'g');

/**
 * @param {import('../../../kernel/project.js').Project} project
 * @returns {boolean}
 */
const hasTsconfig = (project) => project.tsconfig !== null;

/**
 * @param {import('../../../kernel/project.js').Project} project
 * @param {string} key
 * @param {unknown} value
 * @returns {import('../check.js').FixOutcome}
 */
function applyCompilerOption(project, key, value) {
	const file = /** @type {NonNullable<typeof project.tsconfig>} */ (project.tsconfig).path;
	const source = readFileSync(file, 'utf8');
	const edited = setCompilerOption(source, key, value);

	if (!edited) {
		return {
			changed: false,
			message: `Could not edit ${path.basename(file)} safely; set "${key}" by hand.`,
		};
	}
	if (!edited.changed) return { changed: false, message: `"${key}" is already set.` };

	writeFileSync(file, edited.text);
	return {
		changed: true,
		message: `Set "${key}": ${JSON.stringify(value)}`,
		files: [path.relative(project.root, file)],
	};
}

/** @type {import('../check.js').Check[]} */
export const typescriptChecks = [
	{
		id: 'ts.jsx-import-source',
		title: 'JSX import source',
		category: 'typescript',
		severity: 'error',
		applies: hasTsconfig,
		run(ctx, project) {
			const options = project.tsconfig?.config.compilerOptions ?? {};
			if (options.jsxImportSource === 'octane') return pass('jsxImportSource is "octane"');
			return fail(
				options.jsxImportSource
					? `jsxImportSource is "${options.jsxImportSource}", not "octane"`
					: 'jsxImportSource is not set',
				{ detail: ["Octane JSX resolves through its own runtime, not React's."] },
			);
		},
		fix: (ctx, project) => applyCompilerOption(project, 'jsxImportSource', 'octane'),
	},
	{
		id: 'ts.tsrx-plugin',
		title: 'TSRX language service',
		category: 'typescript',
		severity: 'error',
		applies: (project) => hasTsconfig(project) && project.tsrxFiles.length > 0,
		run(ctx, project) {
			const plugins = project.tsconfig?.config.compilerOptions?.plugins;
			if (Array.isArray(plugins) && plugins.some((plugin) => plugin?.name === TSRX_PLUGIN)) {
				return pass(`${TSRX_PLUGIN} is registered`);
			}
			return fail(`${TSRX_PLUGIN} is not in compilerOptions.plugins`, {
				detail: [
					'Without it the editor cannot resolve .tsrx modules, so every import is `any`.',
					`Add: "plugins": [{ "name": "${TSRX_PLUGIN}" }]`,
				],
			});
		},
		fix(ctx, project) {
			const plugins = project.tsconfig?.config.compilerOptions?.plugins;
			if (Array.isArray(plugins) && plugins.length > 0) {
				return {
					changed: false,
					message: `compilerOptions.plugins already has entries; add { "name": "${TSRX_PLUGIN}" } by hand.`,
				};
			}
			return applyCompilerOption(project, 'plugins', [{ name: TSRX_PLUGIN }]);
		},
	},
	{
		id: 'ts.module-resolution',
		title: 'Module resolution',
		category: 'typescript',
		severity: 'warning',
		applies: hasTsconfig,
		run(ctx, project) {
			const resolution = project.tsconfig?.config.compilerOptions?.moduleResolution;
			if (!resolution) return warn('moduleResolution is not set; "bundler" is expected');
			if (LEGACY_RESOLUTION.has(String(resolution).toLowerCase())) {
				return warn(`moduleResolution is "${resolution}"`, {
					detail: ['Octane packages publish export maps; use "bundler", "node16", or "nodenext".'],
				});
			}
			return pass(`moduleResolution is "${resolution}"`);
		},
	},
	{
		id: 'ts.typecheck-script',
		title: 'Typecheck script',
		category: 'typescript',
		severity: 'warning',
		applies: (project) => project.tsrxFiles.length > 0,
		run(ctx, project) {
			const script = project.manifest.scripts?.typecheck;
			if (!script) return skip('No typecheck script');
			if (script.includes('tsrx-tsc')) return pass('typecheck runs tsrx-tsc');
			if (!BARE_TSC.test(script)) return skip(`typecheck runs "${script}"`);
			return fail('typecheck runs plain tsc', {
				detail: [
					'Plain tsc cannot read .tsrx. Any program containing them must use tsrx-tsc.',
					`Current: ${script}`,
				],
			});
		},
		fix(ctx, project) {
			const file = path.join(project.root, 'package.json');
			const source = readFileSync(file, 'utf8');
			const range = findNestedProperty(source, ['scripts', 'typecheck']);
			if (!range) return { changed: false, message: 'Could not locate the typecheck script.' };

			const current = source.slice(range.valueStart, range.valueEnd);
			const replaced = current.replace(BARE_TSC_GLOBAL, (_m, before) => `${before}tsrx-tsc`);
			if (replaced === current) return { changed: false, message: 'Nothing to replace.' };

			writeFileSync(
				file,
				source.slice(0, range.valueStart) + replaced + source.slice(range.valueEnd),
			);
			return {
				changed: true,
				message: 'Rewrote typecheck to use tsrx-tsc',
				files: ['package.json'],
			};
		},
	},
	{
		id: 'ts.wildcard-tsrx-decl',
		title: 'No wildcard .tsrx declaration',
		category: 'typescript',
		severity: 'error',
		run(ctx, project) {
			const offenders = project.sourceFiles.filter((file) => {
				if (!/\.(?:[cm]?tsx?|d\.ts)$/.test(file)) return false;
				try {
					return readFileSync(file, 'utf8')
						.split('\n')
						.some((line) => WILDCARD_DECL.test(line));
				} catch {
					return false;
				}
			});

			if (offenders.length === 0) return pass('No wildcard .tsrx module declaration');

			return fail(`declare module '*.tsrx' found in ${offenders.length} file(s)`, {
				detail: [
					'This silences .tsrx resolution instead of fixing it, so every import it covers',
					'resolves to `any`, including your own components.',
					'Remove it, then install @tsrx/typescript-plugin and typecheck with tsrx-tsc.',
					...offenders.map((file) => `  ${path.relative(project.root, file)}`),
				],
			});
		},
	},
];
