import fs from 'node:fs';
import path from 'node:path';
import { findRoot, readInstalled, scanSourceFiles } from '@octanejs/cli';
import { DATA } from '@octanejs/cli/data';
import ts from 'typescript';
import { finding, loadCompiler, thrown } from './compiler.js';
import { PORTED_PACKAGES } from './mappings.js';
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
 * @property {Note[]} notes the codemod's own findings, at the original file's
 *   lines
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
 * @property {Missing[]} missing React packages the code imports that have no
 *   Octane port, and how it uses them
 * @property {string[]} html entry pages whose script reference was updated
 * @property {string | null} compiler where the verifying compiler came from
 *
 * @typedef {import('./transform.js').Unported & { modules: number }} Missing
 *   with how many modules import it
 */

const SOURCE = /\.(?:[cm]?[jt]sx?)$/;
/** React packages and the Octane package that replaces each. */
const CATALOG = { ...DATA.reactPackages, ...PORTED_PACKAGES };
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
	const config = tsconfigOptions(root);
	const program = projectProgram(config, files);
	const checker = program?.getTypeChecker();
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
	/** @type {Map<string, Missing>} */
	const missing = new Map();
	// `ReactCompat` hosts a component from a package with no port in a React
	// root, from 19.2 within the React 19 series it supports.
	const reactCompat = ['react', 'react-dom'].every((name) =>
		/^19\.(?:[2-9]|\d{2,})\./.test(readInstalled(root, name)?.version ?? ''),
	);
	/** @type {FileResult[]} */
	const results = [];
	for (const file of files) {
		const source = fs.readFileSync(file, 'utf8');
		/** @type {Note[]} */
		const extra = [];
		const resolveSpecifier = (/** @type {string} */ specifier) =>
			resolveRelative(file, specifier, known, renames) ??
			resolveAlias(file, specifier, renames, config) ??
			resolveBinding(specifier, packages, extra);
		const isContext = (/** @type {string} */ specifier, /** @type {string} */ name) => {
			if (!specifier.startsWith('.')) return null;
			const target = resolveModule(file, specifier, known);
			return target ? contextsOf(target.file).has(name) : null;
		};
		const sourceFile = program?.getSourceFile(file);
		const result = transformModule(source, file, {
			target,
			strong,
			strictNullChecks: program !== null,
			types: sourceFile && checker && { sourceFile, checker },
			resolveSpecifier,
			isContext,
			unported: (specifier) => unportedName(specifier, file),
			reactCompat,
		});
		for (const port of result.unported) {
			const entry = missing.get(port.name) ?? {
				name: port.name,
				modules: 0,
				islands: 0,
				blocked: 0,
			};
			entry.modules++;
			entry.islands += port.islands;
			entry.blocked += port.blocked;
			missing.set(port.name, entry);
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

	// TSRX written for React (`@tsrx/react`) is a dialect the TypeScript
	// parser cannot read, so it is reported rather than skipped silently.
	for (const file of paths.flatMap((entry) => collect(path.resolve(entry), isTsrx))) {
		const source = fs.readFileSync(file, 'utf8');
		const react = /^import\b[^;]*?\bfrom\s+['"]react(?:-dom)?(?:\/[^'"]*)?['"]/m.exec(source);
		if (!react || /\bfrom\s+['"]octane(?:\/[^'"]*)?['"]/.test(source)) continue;
		results.push({
			file: path.relative(root, file),
			output: path.relative(root, file),
			changed: false,
			rules: {},
			notes: [
				{
					rule: 'tsrx-react',
					severity: 'error',
					line: source.slice(0, react.index).split('\n').length,
					message:
						'This is TSRX written for React (`@tsrx/react`), which the codemod cannot read. Port it by hand: its templates are already TSRX, but its React imports and APIs need the changes the codemod makes to TSX.',
				},
			],
			strong: null,
			strongFixes: [],
			diagnostics: [],
			code: source,
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
		missing: [...missing.values()].sort((a, b) => a.name.localeCompare(b.name)),
		html,
		compiler: compiler?.from ?? null,
	};
}

/**
 * Whether Octane compiles this module: `.tsrx`, JSX, or a module that imports
 * the runtime. A declaration file is only types.
 *
 * @param {string} file
 * @param {string} code
 */
function isCompiled(file, code) {
	if (file.endsWith('.d.ts')) return false;
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
 * The modules under `entry` that pass `test`: by default, those the codemod
 * migrates.
 *
 * @param {string} entry
 * @param {(name: string) => boolean} [test]
 */
function collect(entry, test = isSource) {
	if (fs.statSync(entry).isFile()) return test(entry) ? [entry] : [];
	return scanSourceFiles(entry, { limit: Infinity }).filter(test).sort();
}

/** @param {string} name */
function isTsrx(name) {
	return name.endsWith('.tsrx');
}

/**
 * The compiler options of the tsconfig that governs `root`, or null.
 *
 * @param {string} root
 * @returns {ts.CompilerOptions | null}
 */
function tsconfigOptions(root) {
	const file = ts.findConfigFile(root, ts.sys.fileExists);
	if (!file) return null;
	const { config } = ts.readConfigFile(file, ts.sys.readFile);
	return ts.parseJsonConfigFileContent(config ?? {}, ts.sys, path.dirname(file)).options;
}

/**
 * A program over the TypeScript modules being migrated, under the project's
 * tsconfig, so their types resolve through imports. Null unless that config
 * enables `strictNullChecks`: without it a `string` may still hold null, so
 * types cannot prove a hole is text.
 *
 * @param {ts.CompilerOptions | null} options
 * @param {string[]} files
 */
function projectProgram(options, files) {
	if (!options || !(options.strictNullChecks ?? options.strict)) return null;
	return ts.createProgram(
		files.filter((name) => /\.[cm]?tsx?$/.test(name)),
		// As the compiler's typed-text proof requires.
		{ ...options, noEmit: true, noUncheckedIndexedAccess: true },
	);
}

/**
 * Bundler and tool configs belong to `octane init`, not the codemod.
 *
 * @param {string} name
 */
function isSource(name) {
	return SOURCE.test(name) && !/\.config\.[cm]?[jt]s$/.test(name);
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
 * The new specifier for an import of a renamed module through a tsconfig
 * `paths` alias (`~/components/Card`), resolved as TypeScript resolves it.
 *
 * @param {string} from
 * @param {string} specifier
 * @param {Map<string, string>} renames
 * @param {ts.CompilerOptions | null} options
 */
function resolveAlias(from, specifier, renames, options) {
	if (!options?.paths || specifier.startsWith('.')) return null;
	const file = ts.resolveModuleName(specifier, from, { ...options, preserveSymlinks: true }, ts.sys)
		.resolvedModule?.resolvedFileName;
	if (!file || !renames.has(file)) return null;
	if (SOURCE.test(specifier)) return specifier.replace(SOURCE, '.tsrx');
	return path.basename(file).startsWith('index.') && !/(?:^|\/)index$/.test(specifier)
		? `${specifier}/index.tsrx`
		: `${specifier}.tsrx`;
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
 * @param {string} specifier
 * @param {Map<string, string>} packages
 * @param {Note[]} notes
 */
function resolveBinding(specifier, packages, notes) {
	const name = catalogName(specifier);
	if (name === null) return null;
	const binding = CATALOG[name];
	packages.set(name, binding);
	const entry = DATA.bindings.find((candidate) => candidate.name === binding);
	// An aggregate binding (`@octanejs/visx`, for `@visx/visx`) serves each
	// package of its scope from a subpath: `@visx/hierarchy` is
	// `@octanejs/visx/hierarchy`.
	const upstream = entry?.upstream?.package;
	const aggregate = upstream?.match(/^@([^/]+)\/\1$/);
	if (aggregate && name !== upstream && name.startsWith(`@${aggregate[1]}/`)) {
		return `${binding}/${name.slice(aggregate[1].length + 2)}${specifier.slice(name.length)}`;
	}
	const subpath = specifier.slice(name.length);
	if (subpath === '' || entry?.exports.some((key) => serves(key, `.${subpath}`))) {
		return binding + subpath;
	}
	// A binding outside the catalog has exports the codemod cannot see.
	notes.push(
		entry
			? {
					rule: 'bindings',
					severity: 'error',
					line: 1,
					message: `\`${binding}\` has no \`.${subpath}\` export. Import these names from its root if it exports them there.`,
				}
			: {
					rule: 'bindings',
					severity: 'warning',
					line: 1,
					message: `Check that \`${binding}${subpath}\` exists; the binding may export it from its root.`,
				},
	);
	return binding + subpath;
}

/**
 * Whether a package `exports` key serves a subpath, directly or through a
 * `*` pattern such as `./locale/*`.
 *
 * @param {string} key
 * @param {string} subpath
 */
function serves(key, subpath) {
	const [head, tail] = key.split('*');
	return tail === undefined ? key === subpath : subpath.startsWith(head) && subpath.endsWith(tail);
}

/**
 * The catalog entry for a package specifier, or null. The catalog keys some
 * bindings by subpath (`better-auth/react`), so the longest matching prefix
 * wins.
 *
 * @param {string} specifier
 */
function catalogName(specifier) {
	if (specifier.startsWith('.') || specifier.startsWith('/')) return null;
	const parts = specifier.split('/');
	for (let length = parts.length; length > 0; length--) {
		const candidate = parts.slice(0, length).join('/');
		if (candidate in CATALOG) return candidate;
	}
	return null;
}

/**
 * The React package a specifier names when Octane has no binding for it, or
 * null.
 *
 * @param {string} specifier
 * @param {string} from the importing module
 */
function unportedName(specifier, from) {
	if (specifier.startsWith('.') || specifier.startsWith('/') || catalogName(specifier) !== null)
		return null;
	const parts = specifier.split('/');
	const root = specifier.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0];
	// Any package's `/react` entry renders with React (`@tanstack/markdown/react`).
	if (/\/react(?:\/|$)/.test(specifier.slice(root.length))) return specifier;
	return rendersWithReact(root, from) ? root : null;
}

/**
 * Whether a package renders through React: it declares `react` as a peer or
 * dependency when installed, or its name says so when it is not. A package
 * with a `./react` entry (`@pierre/trees/react`) renders through React there,
 * which the caller matches by subpath; its other entries need no binding. An
 * optional peer alone does not say which entries use React.
 *
 * @param {string} name
 * @param {string} from
 */
function rendersWithReact(name, from) {
	if (name === 'octane' || name.startsWith('@octanejs/') || name.startsWith('node:')) return false;
	const manifest = readInstalled(path.dirname(from), name)?.manifest;
	if (!manifest) return REACT_PACKAGE.test(name);
	if (manifest.exports?.['./react']) return false;
	return ['peerDependencies', 'dependencies'].some((field) => manifest[field]?.react !== undefined);
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
				// Vite serves `/` from the page's own directory, as it does `./`.
				const file = path.join(path.dirname(page), src);
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
 * The HTML pages a Vite or CRA app keeps beside its sources: those in the
 * root, `public/`, `src/`, and each migrated directory.
 *
 * @param {string} root
 * @param {string[]} targets
 */
function findHtml(root, targets) {
	const dirs = new Set([root, path.join(root, 'public'), path.join(root, 'src'), ...targets]);
	return [...dirs]
		.filter((dir) => fs.existsSync(dir) && fs.statSync(dir).isDirectory())
		.flatMap((dir) =>
			fs
				.readdirSync(dir)
				.filter((name) => name.endsWith('.html'))
				.map((name) => path.join(dir, name)),
		);
}
