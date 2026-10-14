import { realpathSync, statSync } from 'node:fs';
import path from 'node:path';
import { readInstalled } from '../../kernel/project.js';
import { runtimeRequests } from './strong-coverage.js';

/** The conditions a client build resolves a package's `exports` with. */
const CONDITIONS = new Set(['browser', 'import', 'module', 'default']);
const EXTENSIONS = ['.tsrx', '.tsx', '.ts', '.jsx', '.js', '.mts', '.mjs'];

/**
 * The target a package's `exports` gives `subpath` under client conditions. A
 * `*` in a key stands for the rest of the subpath, which replaces the `*` in
 * its target. As in Node, the pattern with the longest prefix wins.
 *
 * @param {any} exports
 * @param {string} subpath `.` or `./…`
 * @returns {string | null}
 */
function exportTarget(exports, subpath) {
	const entries =
		typeof exports === 'string' ||
		Array.isArray(exports) ||
		!Object.keys(exports).some((key) => key.startsWith('.'))
			? { '.': exports }
			: exports;
	if (Object.hasOwn(entries, subpath)) return conditionTarget(entries[subpath]) ?? null;
	let best = '';
	for (const key of Object.keys(entries)) {
		const star = key.indexOf('*');
		if (
			star !== -1 &&
			subpath.length >= key.length - 1 &&
			subpath.startsWith(key.slice(0, star)) &&
			subpath.endsWith(key.slice(star + 1)) &&
			(star > best.indexOf('*') || (star === best.indexOf('*') && key.length > best.length))
		) {
			best = key;
		}
	}
	if (best === '') return null;
	const star = best.indexOf('*');
	const matched = subpath.slice(star, subpath.length - (best.length - star - 1));
	return conditionTarget(entries[best])?.replaceAll('*', matched) ?? null;
}

/**
 * A target under client conditions. `null` is a target that excludes the
 * export; `undefined` means no condition matched, so the caller tries its next
 * one. An array lists fallbacks in order.
 *
 * @param {any} value
 * @returns {string | null | undefined}
 */
function conditionTarget(value) {
	if (typeof value === 'string' || value === null) return value;
	if (Array.isArray(value)) {
		for (const fallback of value) {
			const target = conditionTarget(fallback);
			if (typeof target === 'string') return target;
		}
		return null;
	}
	if (typeof value !== 'object') return null;
	for (const [condition, nested] of Object.entries(value)) {
		if (!CONDITIONS.has(condition)) continue;
		const target = conditionTarget(nested);
		if (target !== undefined) return target;
	}
	return undefined;
}

/**
 * The first existing file a bundler would load for `base`, as a real path,
 * trying the source extensions and an `index` module, and the `.ts` a
 * TypeScript source means by `./x.js`.
 *
 * @param {string} base
 * @returns {string | null}
 */
function resolveFile(base) {
	const candidates = [
		base,
		...EXTENSIONS.map((extension) => base + extension),
		...EXTENSIONS.map((extension) => path.join(base, `index${extension}`)),
	];
	if (base.endsWith('.js')) candidates.push(`${base.slice(0, -3)}.ts`, `${base.slice(0, -3)}.tsx`);
	for (const candidate of candidates) {
		if (statSync(candidate, { throwIfNoEntry: false })?.isFile()) return realpathSync(candidate);
	}
	return null;
}

/**
 * The module a client build loads for `request` from `importer`, or `null`.
 * Real paths, as bundlers use, keep a linked package's own dependencies
 * resolvable. Aliases and virtual modules belong to the bundler config and are
 * not followed.
 *
 * @param {string} request
 * @param {string} importer
 * @returns {string | null}
 */
function resolveRequest(request, importer) {
	if (request.startsWith('.')) return resolveFile(path.resolve(path.dirname(importer), request));
	const match = /^((?:@[^/]+\/)?[^/]+)(\/.*)?$/.exec(request);
	if (match === null) return null;
	const installed = readInstalled(path.dirname(importer), match[1]);
	if (installed === null) return null;
	const subpath = match[2] ?? '';
	const { exports, module, main } = installed.manifest;
	const target =
		exports == null ? subpath || module || main || 'index' : exportTarget(exports, `.${subpath}`);
	return target === null ? null : resolveFile(path.join(installed.dir, target));
}

/**
 * An export the module declares itself, capturing `default`, a declared name,
 * a variable declaration's destructuring pattern or the rest of its line, or a
 * local `export { … }` list, which a following `from` would make a re-export
 * instead.
 */
const LOCAL_EXPORT =
	/^\s*export\s+(?:(default)\b|(?:declare\s+)?(?:async\s+)?(?:function\*?|(?:abstract\s+)?class|enum)\s+([\w$]+)|(?:declare\s+)?(?:const|let|var)\s+(\{[^}]*\}|\[[^\]]*\]|[^;\n]*)|\{([^}]*)\}(?!\s*from\b))/gm;

/**
 * Does the module declare one of `names` itself, rather than pass it on from
 * another module? `null` asks for the whole module, which always counts.
 *
 * @param {string} source
 * @param {Set<string> | null} names
 */
function declaresAny(source, names) {
	if (names === null) return true;
	for (const [, isDefault, declared, variables, list] of source.matchAll(LOCAL_EXPORT)) {
		// Every identifier in a variable declaration counts, so a destructured
		// name or a second declarator does. Reading initializers too can only
		// keep a module in the report, never drop one.
		const exported =
			variables !== undefined
				? (variables.match(/[A-Za-z_$][\w$]*/g) ?? [])
				: list === undefined
					? [isDefault ? 'default' : declared]
					: list.split(',').map((specifier) =>
							specifier
								.trim()
								.split(/\s+as\s+/)
								.pop(),
						);
		if (exported.some((name) => name !== undefined && names.has(name))) return true;
	}
	return false;
}

/**
 * The names a statement's `bindings` take from its target when `wanted` are
 * taken from the module that declares it. `null` is every name.
 *
 * @param {[string, string][]} bindings
 * @param {Set<string> | null} wanted
 * @returns {Set<string> | null}
 */
function taken(bindings, wanted) {
	const names = new Set();
	for (const [name, local] of bindings) {
		// `export *` passes on whatever is wanted through it, except `default`.
		if (local === '*') {
			return wanted === null ? null : new Set([...wanted].filter((name) => name !== 'default'));
		}
		if (wanted !== null && !wanted.has(local)) continue;
		if (name === '*') return null;
		names.add(name);
	}
	return names;
}

/**
 * What Strong modules import from other packages that does not compile under
 * Strong mode, and the `octane/react` (ReactCompat) boundaries they reach.
 *
 * Each Strong module's own imports are followed one step, and from there only
 * the re-exports that pass on a name it imports, because a re-export hands the
 * importer the very module it names while a dependency's own imports are its
 * implementation. A module counts when it declares one of the names taken
 * from it, Octane compiles it, it belongs to a package other than its Strong
 * importer's, and it is not Strong. The last three answers come from the
 * project's compiler.
 *
 * @param {{
 *   roots: string[],
 *   status: import('./strong-coverage.js').StrongPolicy['status'],
 *   modulePackage: (source: string, absolute: string) => import('./strong-coverage.js').ModulePackage,
 *   read: (absolute: string) => string,
 *   display: (absolute: string) => string,
 * }} input
 */
export function findStrongDependencies({ roots, status, modulePackage, read, display }) {
	/** @type {Map<string, { source: string, owner: import('./strong-coverage.js').ModulePackage, name: string, module: string } | null>} */
	const modules = new Map();
	/** @param {string} absolute */
	const moduleAt = (absolute) => {
		if (modules.has(absolute)) return modules.get(absolute) ?? null;
		let source;
		try {
			source = read(absolute);
		} catch {
			// Unreadable: its own build reports it, and it has nothing to follow.
			modules.set(absolute, null);
			return null;
		}
		const owner = modulePackage(source, absolute);
		const root = owner.root ?? path.dirname(absolute);
		const module = {
			source,
			owner,
			name: owner.name ?? display(root),
			module: path.relative(root, absolute).split(path.sep).join('/'),
		};
		modules.set(absolute, module);
		return module;
	};

	/**
	 * @param {string} source
	 * @param {string} absolute
	 */
	const notStrong = (source, absolute) => {
		try {
			return !status(source, absolute).strong;
		} catch {
			// It does not parse, so it fails its own build. Like the coverage
			// measurement, the report leaves it out.
			return false;
		}
	};

	/** @type {Map<string, { name: string, modules: Set<string>, importers: Set<string> }>} */
	const packages = new Map();
	/** @type {Map<string, { package: string, module: string, importers: Set<string> }>} */
	const reactCompat = new Map();
	for (const authored of roots) {
		const root = realpathSync(authored);
		const importer = display(authored);
		const home = moduleAt(root)?.owner.root;
		const seen = new Set();
		/**
		 * @param {string} absolute
		 * @param {Set<string> | null} wanted the names taken from it; `null` is all
		 */
		const visit = (absolute, wanted) => {
			const key = `${absolute}\0${wanted === null ? '*' : [...wanted].sort().join()}`;
			const from = moduleAt(absolute);
			if (seen.has(key) || from === null) return;
			seen.add(key);
			const { owner, source } = from;
			// A module that only passes names on is a step, not a dependency.
			const provides = declaresAny(source, wanted);
			if (provides && owner.compiled && owner.root !== home && notStrong(source, absolute)) {
				const group = packages.get(from.name) ?? {
					name: from.name,
					modules: new Set(),
					importers: new Set(),
				};
				group.modules.add(from.module);
				group.importers.add(importer);
				packages.set(from.name, group);
			}
			for (const { request, reexport, bindings } of runtimeRequests(source)) {
				if (/^octane\/react(?:\/|$)/.test(request)) {
					if (!provides) continue;
					const boundary = reactCompat.get(absolute) ?? {
						package: from.name,
						module: from.module,
						importers: new Set(),
					};
					boundary.importers.add(importer);
					reactCompat.set(absolute, boundary);
					continue;
				}
				if ((!reexport && absolute !== root) || /^octane(?:\/|$)/.test(request)) continue;
				const names = taken(bindings, wanted);
				const target = names?.size === 0 ? null : resolveRequest(request, absolute);
				if (target !== null) visit(target, names);
			}
		};
		visit(root, null);
	}

	return {
		packages: [...packages.values()]
			.map(({ name, modules, importers }) => ({
				name,
				modules: [...modules].sort(),
				importers: [...importers].sort(),
			}))
			.sort((a, b) => a.name.localeCompare(b.name)),
		reactCompat: [...reactCompat.values()]
			.map((boundary) => ({ ...boundary, importers: [...boundary.importers].sort() }))
			.sort((a, b) => a.package.localeCompare(b.package) || a.module.localeCompare(b.module)),
	};
}
