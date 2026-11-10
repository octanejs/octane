// What Strong modules reach in other packages that does not compile under
// Strong mode. `octane analyze --strong-dependencies` reports it, and
// `compiler.strongDependencies.require` turns each entry into a build error.
// Both read it from here so the report previews exactly what the build rejects.

import { readFileSync, realpathSync, statSync } from 'node:fs';
import path from 'node:path';

/**
 * Comments and template literals, whose text is not code, and quoted strings,
 * which can hold either opener. A template's `${}` is code, but nothing a
 * statement scanner reads lives there, and a nested template's backticks pair
 * up inside it.
 */
const TEXT =
	/\/\/[^\n]*|\/\*[\s\S]*?(?:\*\/|$)|'(?:\\.|[^'\\\n])*'?|"(?:\\.|[^"\\\n])*"?|`(?:\\[\s\S]|[^`\\])*`?/g;

/**
 * `source` with comment and template literal text blanked, so a statement
 * scanner never reads code that is only text, such as a code sample in a
 * template string. Line breaks stay, and so do a template's backticks, so a
 * tagged template never reads as a bare name. Quoted strings stay: a specifier
 * is one, and one ends at its line, so it cannot hold a statement.
 *
 * @param {string} source
 */
function codeOnly(source) {
	return source.replace(TEXT, (text) =>
		text[0] === "'" || text[0] === '"'
			? text
			: text.replace(text[0] === '`' ? /[^\n`]/g : /[^\n]/g, ' '),
	);
}

/**
 * An `import … from` or `export … from` statement, capturing its keyword,
 * clause, and specifier. The clause may span lines but never reaches into the
 * next statement of either kind, so a semicolon-free module cannot borrow a
 * later statement's specifier.
 */
const STATIC_REQUEST =
	/^\s*(import|export)\s+((?:(?!\b(?:import|export)\b)[^;])*?)\s*\bfrom\s*['"]([^'"]+)['"]/gm;

/**
 * The module's imports and re-exports that bind something at runtime, each
 * with the names it binds as `[name in the target, name here]` pairs, where
 * `*` stands for the whole target (`* as ns`) or, on both sides, everything it
 * exports (`export *`). TypeScript erases a `type` clause and every
 * `type`-marked specifier, so a clause left with no binding leaves no request
 * behind.
 *
 * @param {string} source
 * @returns {{ request: string, reexport: boolean, bindings: [string, string][] }[]}
 */
function runtimeRequests(source) {
	const requests = [];
	for (const [, keyword, authored, request] of codeOnly(source).matchAll(STATIC_REQUEST)) {
		const clause = authored.trim();
		const reexport = keyword === 'export';
		// A re-export clause opens with `*` or `{`; anything else is a
		// declaration that happens to spell `from '…'`.
		if (/^type\b/.test(clause) || (reexport && !/^[*{]/.test(clause))) continue;
		/** @type {[string, string][]} */
		const bindings = [];
		const named = /\{([\s\S]*)\}/.exec(clause);
		for (const specifier of named?.[1].split(',') ?? []) {
			const [name, local = name] = specifier.trim().split(/\s+as\s+/);
			if (name && !/^type\s/.test(name)) bindings.push([name.replace(/^['"]|['"]$/g, ''), local]);
		}
		const outside = clause.replace(/\{[\s\S]*\}/, '');
		const namespace = /\*(?:\s+as\s+([\w$]+))?/.exec(outside);
		if (namespace !== null) bindings.push(['*', namespace[1] ?? '*']);
		const defaultName = /^([\w$]+)\s*(?:,|$)/.exec(outside.trim());
		if (defaultName !== null) bindings.push(['default', defaultName[1]]);
		if (bindings.length > 0) requests.push({ request, reexport, bindings });
	}
	return requests;
}

/**
 * The installed package `name` as Node resolves it from `root`: the nearest
 * `node_modules/<name>` with a readable manifest.
 *
 * @param {string} root
 * @param {string} name
 * @returns {{ dir: string, manifest: any } | null}
 */
function readInstalled(root, name) {
	let dir = path.resolve(root);
	for (;;) {
		const candidate = path.join(dir, 'node_modules', name);
		try {
			return {
				dir: candidate,
				manifest: JSON.parse(readFileSync(path.join(candidate, 'package.json'), 'utf8')),
			};
		} catch {
			// Not installed here; keep walking up.
		}
		const parent = path.dirname(dir);
		if (parent === dir) return null;
		dir = parent;
	}
}

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
 * An export the module declares itself, capturing `default` and the binding a
 * bare `export default name` names, a declared name, a variable declaration's
 * destructuring pattern or the rest of its line, or a local `export { … }`
 * list, which a following `from` would make a re-export instead.
 */
const LOCAL_EXPORT =
	/^\s*export\s+(?:(default)\b(?:\s+([\w$]+)\s*;?\s*$)?|(?:declare\s+)?(?:async\s+)?(?:function\*?|(?:abstract\s+)?class|enum)\s+([\w$]+)|(?:declare\s+)?(?:const|let|var)\s+(\{[^}]*\}|\[[^\]]*\]|[^;\n]*)|\{([^}]*)\}(?!\s*from\b))/gm;

/** `name = binding` or `name = binding.member`, the whole of a declaration. */
const ALIAS = /^([\w$]+)\s*=\s*([\w$]+)(?:\.([\w$]+))?$/;

/**
 * How the module exports `names`: `provides` when it declares one itself, and
 * `renamed`, for each imported binding that an export of one of them only
 * renames (`export const X = binding`, `= ns.member`, `export { binding as X }`
 * or `export default binding`), the members read from it, `null` for the whole
 * binding. A renamed binding passes its import's names on, as a re-export
 * does. `null` names ask for the whole module, which always counts.
 *
 * @param {string} source
 * @param {Set<string> | null} names
 * @param {Set<string>} imported the bindings the module's imports declare
 */
function ownExports(source, names, imported) {
	let provides = names === null;
	/** @type {Map<string, Set<string> | null>} */
	const renamed = new Map();
	for (const [, isDefault, binding, declared, variables, list] of codeOnly(source).matchAll(
		LOCAL_EXPORT,
	)) {
		const alias = variables === undefined ? null : ALIAS.exec(variables.trim());
		/** @type {[string | undefined, string?, string?][]} exported name, binding, member */
		const exported =
			list !== undefined
				? list.split(',').map((specifier) => {
						const [local, name = local] = specifier.trim().split(/\s+as\s+/);
						return [name, local];
					})
				: alias !== null
					? [[alias[1], alias[2], alias[3]]]
					: variables !== undefined
						? // Every identifier in any other declaration counts, so a
							// destructured name or a second declarator does. Reading
							// initializers too can only keep a module in the report.
							(variables.match(/[A-Za-z_$][\w$]*/g) ?? []).map((name) => [name])
						: [[isDefault ? 'default' : declared, binding]];
		for (const [name, local, member] of exported) {
			if (name === undefined || (names !== null && !names.has(name))) continue;
			if (local === undefined || !imported.has(local)) provides = true;
			else if (member === undefined) renamed.set(local, null);
			else if (renamed.get(local) !== null) {
				renamed.set(local, (renamed.get(local) ?? new Set()).add(member));
			}
		}
	}
	return { provides, renamed };
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
 * The names an import's `bindings` take from its target for the exports that
 * only rename them (see ownExports). `null` is every name.
 *
 * @param {[string, string][]} bindings
 * @param {Map<string, Set<string> | null>} renamed
 * @returns {Set<string> | null}
 */
function takenByRenames(bindings, renamed) {
	const names = new Set();
	for (const [name, local] of bindings) {
		if (!renamed.has(local)) continue;
		const members = renamed.get(local);
		// A namespace passes on the members its exports read, or all of itself.
		if (name !== '*') names.add(name);
		else if (members == null) return null;
		else for (const member of members) names.add(member);
	}
	return names;
}

/**
 * What Strong modules import from other packages that does not compile under
 * Strong mode, and the `octane/react` (ReactCompat) boundaries they reach.
 *
 * Each Strong module's own imports are followed one step, and from there only
 * the re-exports that pass on a name it imports, including an import that an
 * export only renames, because a re-export hands the importer the very module
 * it names while a dependency's own imports are its implementation. A module
 * counts when it declares one of the names taken from it, Octane compiles it,
 * it belongs to a package other than its Strong importer's, and it is not
 * Strong. The last three answers come from the project's compiler. A Strong
 * module in a dependency answers to the same rule as the roots, so its own
 * imports are followed too, through every Strong layer to the first module
 * that is not Strong.
 *
 * Pass the same `cache` to repeated walks, and drop an entry when its file
 * changes. `files` collects every module the walk read. With `trace`, each
 * entry also lists the root's own `requests` that lead to it. `source`, when
 * given, is the text of the only root, which a build may hold before disk does.
 *
 * @param {{
 *   roots: string[],
 *   status: (source: string, absolute: string) => { strong: boolean },
 *   modulePackage: (source: string, absolute: string) => { name: string | null, root: string | null, compiled: boolean },
 *   read: (absolute: string) => string,
 *   display: (absolute: string) => string,
 *   cache?: Map<string, any>,
 *   files?: Set<string>,
 *   trace?: boolean,
 *   source?: string,
 * }} input
 */
export function findStrongDependencies({
	roots,
	status,
	modulePackage,
	read,
	display,
	cache = new Map(),
	files,
	trace = false,
	source: rootSource,
}) {
	/**
	 * @param {string} absolute
	 * @param {string} [given] the text to use instead of reading, never cached
	 */
	const moduleAt = (absolute, given) => {
		files?.add(absolute);
		if (given === undefined && cache.has(absolute)) return cache.get(absolute);
		let source = given;
		if (source === undefined) {
			try {
				source = read(absolute);
			} catch {
				// Unreadable: its own build reports it, and it has nothing to follow.
				cache.set(absolute, null);
				return null;
			}
		}
		const owner = modulePackage(source, absolute);
		const root = owner.root ?? path.dirname(absolute);
		const module = {
			source,
			owner,
			name: owner.name ?? display(root),
			module: path.relative(root, absolute).split(path.sep).join('/'),
			requests: runtimeRequests(source),
			/** @type {boolean | null | undefined} */
			strong: undefined,
		};
		if (given === undefined) cache.set(absolute, module);
		return module;
	};

	/**
	 * Whether the module compiles under Strong mode, or `null` when it does not
	 * parse. Then it fails its own build, so, like the coverage measurement, the
	 * report leaves it out and follows nothing from it.
	 *
	 * @param {any} module
	 * @param {string} absolute
	 */
	const isStrong = (module, absolute) => {
		if (module.strong === undefined) {
			try {
				module.strong = status(module.source, absolute).strong;
			} catch {
				module.strong = null;
			}
		}
		return module.strong;
	};

	/** @type {Map<string, { name: string, modules: Set<string>, importers: Set<string>, requests: Set<string> }>} */
	const packages = new Map();
	/** @type {Map<string, { package: string, module: string, importers: Set<string>, requests: Set<string> }>} */
	const reactCompat = new Map();
	for (const authored of roots) {
		let root = authored;
		try {
			root = realpathSync(authored);
		} catch {
			// Not on disk yet: only `source` describes it.
		}
		const importer = display(authored);
		const given = rootSource === undefined ? undefined : moduleAt(root, rootSource);
		const home = (given ?? moduleAt(root))?.owner.root;
		const seen = new Set();
		/**
		 * @param {string} absolute
		 * @param {Set<string> | null} wanted the names taken from it; `null` is all
		 * @param {string} via the root's own request this path started from
		 */
		const visit = (absolute, wanted, via) => {
			const key = `${absolute}\0${wanted === null ? '*' : [...wanted].sort().join()}`;
			const from = absolute === root && given !== undefined ? given : moduleAt(absolute);
			if (seen.has(key) || from === null) return;
			seen.add(key);
			const { owner, source, requests } = from;
			const imported = new Set(
				requests.flatMap(({ reexport, bindings }) =>
					reexport ? [] : bindings.map(([, local]) => local),
				),
			);
			// A module that only passes names on is a step, not a dependency.
			const { provides, renamed } = ownExports(source, wanted, imported);
			const strong =
				provides && owner.compiled && owner.root !== home ? isStrong(from, absolute) : null;
			if (strong === false) {
				const group = packages.get(from.name) ?? {
					name: from.name,
					modules: new Set(),
					importers: new Set(),
					requests: new Set(),
				};
				group.modules.add(from.module);
				group.importers.add(importer);
				group.requests.add(via);
				packages.set(from.name, group);
			}
			for (const { request, reexport, bindings } of requests) {
				const next = absolute === root ? request : via;
				if (/^octane\/react(?:\/|$)/.test(request)) {
					if (!provides) continue;
					const boundary = reactCompat.get(absolute) ?? {
						package: from.name,
						module: from.module,
						importers: new Set(),
						requests: new Set(),
					};
					boundary.importers.add(importer);
					boundary.requests.add(next);
					reactCompat.set(absolute, boundary);
					continue;
				}
				if (/^octane(?:\/|$)/.test(request)) continue;
				const names = reexport
					? taken(bindings, wanted)
					: absolute === root || strong === true
						? taken(bindings, null)
						: takenByRenames(bindings, renamed);
				const target = names?.size === 0 ? null : resolveRequest(request, absolute);
				if (target !== null) visit(target, names, next);
			}
		};
		visit(root, null, '');
	}

	/** @param {Set<string>} requests */
	const traced = (requests) => (trace ? { requests: [...requests].sort() } : null);
	return {
		packages: [...packages.values()]
			.map(({ name, modules, importers, requests }) => ({
				name,
				modules: [...modules].sort(),
				importers: [...importers].sort(),
				...traced(requests),
			}))
			.sort((a, b) => a.name.localeCompare(b.name)),
		reactCompat: [...reactCompat.values()]
			.map(({ requests, ...boundary }) => ({
				...boundary,
				importers: [...boundary.importers].sort(),
				...traced(requests),
			}))
			.sort((a, b) => a.package.localeCompare(b.package) || a.module.localeCompare(b.module)),
	};
}
