import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { findRoot, scanSourceFiles } from '@octanejs/cli';
import { DATA } from '@octanejs/cli/data';
import { finding, loadCompiler, thrown } from './compiler.js';
import { strengthen } from './strong.js';
import { transformModule } from './transform.js';

/**
 * @typedef {import('./transform.js').Note} Note
 *
 * @typedef {Object} CodemodOptions
 * @property {'tsrx' | 'tsx'} [target]
 * @property {boolean} [strong] migrate to Strong mode where the compiler
 *   accepts it, falling back to compatibility mode per module
 * @property {boolean} [forceStrong] keep `"use strong"` even on modules with
 *   Strong errors left
 * @property {boolean} [verify] compile every migrated module (default true)
 * @property {boolean} [write] write the result to disk (default true)
 * @property {string} [root] the project root, for resolving its compiler
 *
 * @typedef {Object} FileResult
 * @property {string} file the module's path, relative to the root
 * @property {string} output where it is written, relative to the root
 * @property {boolean} changed
 * @property {Record<string, number>} rules
 * @property {Note[]} notes
 * @property {boolean | null} strong whether it is Strong, or null when Strong
 *   was not requested or does not apply
 * @property {string[]} strongFixes
 * @property {{ code: string, severity: string, message: string, line: number }[]} diagnostics
 *   what the compiler reported for the migrated module
 * @property {string} code
 *
 * @typedef {Object} CodemodResult
 * @property {string} root
 * @property {FileResult[]} files
 * @property {{ from: string, to: string }[]} packages React packages the
 *   migrated code now imports as Octane bindings
 * @property {string[]} missing React packages the code imports that have no
 *   Octane binding
 * @property {string[]} html entry pages whose script reference was updated
 * @property {string | null} compiler where the verifying compiler came from
 */

const SOURCE = /\.(?:[cm]?[jt]sx?)$/;
/** A package that, by its name, renders through React. */
const REACT_PACKAGE = /^(?:react-|@[^/]+\/react(?:-|\/|$)|[^/]+\/react$)|-react(?:\/|$)/;

/**
 * Migrate every React module under `paths`.
 *
 * Two passes: the first decides which modules become `.tsrx`, the second
 * rewrites every module with that rename map in hand, so an import of a
 * renamed module is updated wherever it is.
 *
 * @param {string[]} paths
 * @param {CodemodOptions} [options]
 * @returns {Promise<CodemodResult>}
 */
export async function runCodemod(paths, options = {}) {
	const target = options.target ?? 'tsrx';
	const strong = options.strong === true && target === 'tsrx';
	const root = path.resolve(options.root ?? findRoot(paths[0] ?? '.'));
	const files = paths.flatMap((entry) => collect(path.resolve(entry)));

	const known = new Set(files);
	/** @type {Map<string, string>} */
	const renames = new Map();
	/** @type {Map<string, import('./transform.js').ModuleExports>} */
	const exports = new Map();
	for (const file of files) {
		const result = transformModule(fs.readFileSync(file, 'utf8'), file, { target });
		exports.set(file, result.exports);
		if (result.template) renames.set(file, file.replace(/\.(?:jsx?|tsx)$/, '.tsrx'));
	}
	const contextsOf = contextIndex(exports, known);

	const verify = options.verify !== false;
	const compiler = verify || strong ? await loadCompiler(root) : null;
	/** @type {Map<string, string>} */
	const packages = new Map();
	/** @type {Set<string>} */
	const missing = new Set();
	/** @type {FileResult[]} */
	const results = [];
	for (const file of files) {
		const source = fs.readFileSync(file, 'utf8');
		/** @type {Note[]} */
		const extra = [];
		/** @type {Set<string>} */
		const unmapped = new Set();
		const resolveSpecifier = (/** @type {string} */ specifier) =>
			resolveRelative(file, specifier, known, renames) ??
			resolveBinding(file, specifier, packages, extra, unmapped);
		const isContext = (/** @type {string} */ specifier, /** @type {string} */ name) => {
			if (!specifier.startsWith('.')) return null;
			const target = resolveModule(file, specifier, known);
			return target ? contextsOf(target.file).has(name) : null;
		};
		const result = transformModule(source, file, {
			target,
			strong,
			resolveSpecifier,
			isContext,
		});
		for (const name of unmapped) {
			missing.add(name);
			extra.push({
				rule: 'bindings',
				severity: 'error',
				line: 1,
				message: `No Octane binding for \`${name}\`, a React package; port it or replace it.`,
			});
		}
		const output = renames.get(file) ?? file;
		let code = result.code;
		/** @type {boolean | null} */
		let isStrong = null;
		/** @type {string[]} */
		let strongFixes = [];
		/** @type {FileResult['diagnostics']} */
		let diagnostics = [];
		if (compiler && result.changed) {
			if (strong && result.template) {
				const strengthened = strengthen(compiler, code, output, { force: options.forceStrong });
				code = strengthened.code;
				isStrong = strengthened.strong;
				strongFixes = strengthened.fixed;
				if (!strengthened.strong) diagnostics.push(...strengthened.blockers);
			}
			if (verify && isCompiled(output, code))
				diagnostics.push(...compile(compiler, code, output, isStrong === true));
		}
		results.push({
			file: path.relative(root, file),
			output: path.relative(root, output),
			changed: result.changed || output !== file,
			rules: result.rules,
			notes: [...result.notes, ...extra],
			strong: isStrong,
			strongFixes,
			diagnostics: dedupe(diagnostics),
			code,
		});
	}

	const html = rewriteEntryPages(
		root,
		paths.map((entry) => path.resolve(entry)),
		renames,
		options.write !== false,
	);
	if (options.write !== false) {
		for (const result of results) {
			if (!result.changed) continue;
			const output = path.join(root, result.output);
			fs.writeFileSync(output, result.code);
			if (result.output !== result.file) fs.rmSync(path.join(root, result.file));
		}
	}
	return {
		root,
		files: results,
		packages: [...packages].map(([from, to]) => ({ from, to })),
		missing: [...missing].sort(),
		html,
		compiler: compiler?.from ?? null,
	};
}

/**
 * Whether Octane compiles this module: `.tsrx`, JSX, or a module that imports
 * the runtime.
 *
 * @param {string} file
 * @param {string} code
 */
function isCompiled(file, code) {
	return /\.(?:tsrx|[jt]sx)$/.test(file) || /from\s+['"]octane['"]/.test(code);
}

/**
 * @param {import('./compiler.js').Compiler} compiler
 * @param {string} code
 * @param {string} file
 * @param {boolean} strong
 */
function compile(compiler, code, file, strong) {
	try {
		const result = compiler.collectDiagnostics(code, file, strong ? { strong: true } : {});
		const found = result.diagnostics.filter((d) => d.severity !== 'hint').map(finding);
		return result.error == null ? found : [...found, thrown(result.error)];
	} catch (error) {
		return [thrown(error)];
	}
}

/** @param {FileResult['diagnostics']} diagnostics */
function dedupe(diagnostics) {
	const seen = new Set();
	return diagnostics.filter((d) => {
		const key = `${d.code}:${d.line}:${d.message}`;
		if (seen.has(key)) return false;
		seen.add(key);
		return true;
	});
}

/**
 * The modules under `entry` the codemod migrates.
 *
 * @param {string} entry
 */
function collect(entry) {
	if (fs.statSync(entry).isFile()) return isSource(entry) ? [entry] : [];
	return scanSourceFiles(entry, { limit: Infinity }).filter(isSource).sort();
}

/**
 * Bundler and tool configs belong to `octane init`, not the codemod.
 *
 * @param {string} name
 */
function isSource(name) {
	return SOURCE.test(name) && !name.endsWith('.d.ts') && !/\.config\.[cm]?[jt]s$/.test(name);
}

/**
 * The project module a relative specifier names, trying the extensions and
 * directory indexes a bundler would.
 *
 * @param {string} from
 * @param {string} specifier
 * @param {Set<string>} files
 * @returns {{ file: string, index: boolean } | null}
 */
function resolveModule(from, specifier, files) {
	if (!specifier.startsWith('.')) return null;
	const base = path.resolve(path.dirname(from), specifier);
	const stem = base.replace(/\.(?:[cm]?[jt]sx?)$/, '');
	for (const file of [base, ...['.tsx', '.ts', '.jsx', '.js'].map((ext) => stem + ext)]) {
		if (files.has(file)) return { file, index: false };
	}
	for (const ext of ['.tsx', '.ts', '.jsx', '.js']) {
		const file = path.join(base, 'index' + ext);
		if (files.has(file)) return { file, index: true };
	}
	return null;
}

/**
 * The new specifier for a relative import of a renamed module. `.tsrx` modules
 * are imported by their full name.
 *
 * @param {string} from
 * @param {string} specifier
 * @param {Set<string>} files
 * @param {Map<string, string>} renames
 */
function resolveRelative(from, specifier, files, renames) {
	const target = resolveModule(from, specifier, files);
	if (!target || !renames.has(target.file)) return null;
	if (target.index) return specifier.replace(/\/?$/, '/index.tsrx');
	return specifier.replace(/\.(?:[cm]?[jt]sx?)$/, '') + '.tsrx';
}

/**
 * Which names each module exports as a context, following `export … from`.
 *
 * @param {Map<string, import('./transform.js').ModuleExports>} exports
 * @param {Set<string>} files
 * @returns {(file: string) => Set<string>}
 */
function contextIndex(exports, files) {
	/** @type {Map<string, Set<string>>} */
	const resolved = new Map();
	const contextsOf = (/** @type {string} */ file) => {
		let names = resolved.get(file);
		if (names) return names;
		names = new Set(exports.get(file)?.contexts);
		// Set before following re-exports, so a cycle ends.
		resolved.set(file, names);
		for (const { specifier, names: pairs } of exports.get(file)?.reexports ?? []) {
			const target = resolveModule(file, specifier, files);
			if (!target) continue;
			const theirs = contextsOf(target.file);
			if (pairs === null) for (const name of theirs) names.add(name);
			else for (const [imported, exported] of pairs) if (theirs.has(imported)) names.add(exported);
		}
		return names;
	};
	return contextsOf;
}

/**
 * The binding that replaces a React package import, recorded so the report
 * can list the dependency changes.
 *
 * @param {string} from the importing module
 * @param {string} specifier
 * @param {Map<string, string>} packages
 * @param {Note[]} notes
 * @param {Set<string>} unmapped React packages with no binding
 */
function resolveBinding(from, specifier, packages, notes, unmapped) {
	if (specifier.startsWith('.') || specifier.startsWith('/')) return null;
	// The catalog keys some bindings by subpath (`better-auth/react`), so the
	// longest matching prefix wins.
	const parts = specifier.split('/');
	let name = '';
	for (let length = parts.length; length > 0 && name === ''; length--) {
		const candidate = parts.slice(0, length).join('/');
		if (candidate in DATA.reactPackages) name = candidate;
	}
	if (name === '') {
		const root = specifier.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0];
		if (rendersWithReact(root, from)) unmapped.add(root);
		return null;
	}
	const binding = DATA.reactPackages[name];
	packages.set(name, binding);
	const subpath = specifier.slice(name.length);
	if (subpath !== '') {
		notes.push({
			rule: 'bindings',
			severity: 'warning',
			line: 1,
			message: `Check that \`${binding}${subpath}\` exists; the binding may export it from its root.`,
		});
	}
	return binding + subpath;
}

/**
 * Whether a package renders through React: it declares `react` as a peer or
 * dependency when installed, or its name says so when it is not.
 *
 * @param {string} name
 * @param {string} from
 */
function rendersWithReact(name, from) {
	if (name === 'octane' || name.startsWith('@octanejs/') || name.startsWith('node:')) return false;
	try {
		const manifest = JSON.parse(
			fs.readFileSync(createRequire(from).resolve(`${name}/package.json`), 'utf8'),
		);
		return ['peerDependencies', 'dependencies'].some(
			(field) => manifest[field]?.react !== undefined,
		);
	} catch {
		return REACT_PACKAGE.test(name);
	}
}

/**
 * Point `<script src>` in HTML entry pages at renamed modules.
 *
 * @param {string} root
 * @param {string[]} targets the paths being migrated
 * @param {Map<string, string>} renames
 * @param {boolean} write
 */
function rewriteEntryPages(root, targets, renames, write) {
	/** @type {string[]} */
	const updated = [];
	for (const page of findHtml(root, targets)) {
		const html = fs.readFileSync(page, 'utf8');
		const next = html.replace(
			/(<script\b[^>]*\bsrc=)(["'])([^"']+)\2/g,
			(match, open, quote, src) => {
				const file = src.startsWith('/')
					? path.join(root, src)
					: path.resolve(path.dirname(page), src);
				const renamed = renames.get(file);
				if (!renamed) return match;
				return open + quote + src.replace(/\.[jt]sx?$/, '.tsrx') + quote;
			},
		);
		if (next !== html) {
			updated.push(path.relative(root, page));
			if (write) fs.writeFileSync(page, next);
		}
	}
	return updated;
}

/**
 * The entry pages a Vite or CRA app keeps beside its sources.
 *
 * @param {string} root
 * @param {string[]} targets
 */
function findHtml(root, targets) {
	const pages = new Set(
		['index.html', 'public/index.html', 'src/index.html'].map((name) => path.join(root, name)),
	);
	for (const target of targets) pages.add(path.join(target, 'index.html'));
	return [...pages].filter((file) => fs.existsSync(file));
}
