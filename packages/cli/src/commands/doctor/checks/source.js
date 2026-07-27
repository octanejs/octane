import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fail, pass, skip, warn } from '../check.js';

const IMPORTS_OCTANE = /from\s*['"]octane['"]/;
const OCTANE_PRAGMA = /@jsxImportSource\s+octane/;
const FORWARD_REF_FROM_OCTANE = /import\s*\{[^}]*\bforwardRef\b[^}]*\}\s*from\s*['"]octane['"]/;
const REACT_NODE = /\bReact\.ReactNode\b|\bReactNode\b/;

const REPORT_LIMIT = 10;

/**
 * @param {string} file
 * @returns {string | null}
 */
function read(file) {
	try {
		return readFileSync(file, 'utf8');
	} catch {
		return null;
	}
}

/**
 * @param {import('../../../kernel/project.js').Project} project
 * @param {string[]} files
 * @returns {string[]}
 */
function relative(project, files) {
	const shown = files
		.slice(0, REPORT_LIMIT)
		.map((file) => `  ${path.relative(project.root, file)}`);
	if (files.length > REPORT_LIMIT) shown.push(`  ...and ${files.length - REPORT_LIMIT} more`);
	return shown;
}

/** @type {import('../check.js').Check[]} */
export const sourceChecks = [
	{
		id: 'source.jsx-pragma',
		title: 'JSX pragma on .tsx files',
		category: 'source',
		severity: 'error',
		// Only meaningful when the compiler option is not already project-wide:
		// with `jsxImportSource: "octane"` in tsconfig, a per-file pragma is
		// redundant rather than missing.
		applies: (project) => project.tsconfig?.config.compilerOptions?.jsxImportSource !== 'octane',
		run(ctx, project) {
			const candidates = project.sourceFiles.filter((file) => file.endsWith('.tsx'));
			if (candidates.length === 0) return skip('No .tsx files');

			const missing = candidates.filter((file) => {
				const source = read(file);
				return source !== null && IMPORTS_OCTANE.test(source) && !OCTANE_PRAGMA.test(source);
			});

			if (missing.length === 0) return pass('Every Octane .tsx file declares its JSX source');

			return fail(`${missing.length} .tsx file(s) import octane without the JSX pragma`, {
				detail: [
					'Add `/** @jsxImportSource octane */` at the top, or set',
					'"jsxImportSource": "octane" in tsconfig.json for the whole project.',
					...relative(project, missing),
				],
			});
		},
	},
	{
		id: 'source.forward-ref',
		title: 'No forwardRef import',
		category: 'source',
		severity: 'error',
		run(ctx, project) {
			const offenders = project.sourceFiles.filter((file) => {
				const source = read(file);
				return source !== null && FORWARD_REF_FROM_OCTANE.test(source);
			});

			if (offenders.length === 0) return pass('No forwardRef imported from octane');

			return fail(`${offenders.length} file(s) import forwardRef from octane`, {
				detail: [
					'Octane has no forwardRef. Refs are plain props: ref={cb}, ref={obj}, or ref={[a, b]}.',
					...relative(project, offenders),
				],
			});
		},
	},
	{
		id: 'source.react-node-type',
		title: 'Renderable type',
		category: 'source',
		severity: 'info',
		applies: (project) => project.tsrxFiles.length > 0,
		run(ctx, project) {
			const offenders = project.tsrxFiles.filter((file) => {
				const source = read(file);
				return source !== null && REACT_NODE.test(source);
			});

			if (offenders.length === 0) return pass('Renderables are typed as OctaneNode');

			return warn(`${offenders.length} .tsrx file(s) reference ReactNode`, {
				detail: ['Use OctaneNode for renderables.', ...relative(project, offenders)],
			});
		},
	},
];
