// The per-module half of the octane/data contract check. It finds a module's
// contract declarations and the sites that use them, and reports four rules:
//
// 1. DECLARATION: a contract is an exported module-level `const` initialized
//    by a direct factory call from `octane/data`, with a literal name.
// 2. MODULE: contracts live only in `*.data.ts` / `*.data.js` modules, whose
//    top level holds only imports, types, and `const` declarations and exports.
// 3. ARGUMENT: a contract site names its contract binding directly.
// 4. ESCAPE: a contract is otherwise used only in an import, export, type, or
//    as the object of a property read.
//
// The whole-program pass (handler coverage, unused and duplicate names, the
// generated manifest) consumes what it returns.
//
// A site is matched by its method, import, or property name and its contract
// argument, never by its receiver: a contract in the first argument of any
// `.write(…)` is a write. A call such as `stream.write(chunk)` names no contract
// and is not a site. Completeness comes from rule 4 instead: a contract can
// reach a parameter or variable only through a use this check reports.

import {
	createLexicalAnalysis,
	forEachRuntimeAstChild,
	isIdentifierReference,
} from './compile-universal.js';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { parseModule } from '#octane/compiler-parser';
import { unwrapTsExpr } from './descriptor-lowering.js';

const DATA_CONTRACT_DECLARATION = 'OCTANE_DATA_CONTRACT_DECLARATION';
const DATA_CONTRACT_MODULE = 'OCTANE_DATA_CONTRACT_MODULE';
const DATA_CONTRACT_ARGUMENT = 'OCTANE_DATA_CONTRACT_ARGUMENT';
const DATA_CONTRACT_ESCAPE = 'OCTANE_DATA_CONTRACT_ESCAPE';

const FACTORIES = new Set(['entity', 'feed', 'read', 'view', 'write']);
const DATA_MODULE = /\.data\.[cm]?[jt]s$/;
const DATA_SPECIFIER = /\.data(?:\.[cm]?[jt]s)?$/;
const SERVER_MODULES = ['octane/server', 'octane/data/server', 'octane/data/octane/server'];

/** Method sites, by the index of their contract argument. */
const METHOD_SITES = new Map([
	['read', 0],
	['prefetch', 0],
	['publish', 0],
	['forget', 0],
	['write', 0],
	['form', 0],
]);
/** Function sites, by imported name (or local name for `createDataHandler`'s `handle` and `defineHandler`). */
const FUNCTION_SITES = new Map([
	['useForm', 0],
	['handle', 0],
	['defineHandler', 0],
	['pages', 1],
	['listen', 1],
]);
/**
 * `view({ of })`, `write({ creates, patches, removes })`, a FeedChange's `put`,
 * `remove`, `read`, and the store options `feeds` and `journal.receipt`.
 */
const PROPERTY_SITES = new Set([
	'of',
	'creates',
	'patches',
	'removes',
	'put',
	'remove',
	'read',
	'feeds',
	'receipt',
]);
const FUNCTIONS = new Set(['ArrowFunctionExpression', 'FunctionExpression']);

/**
 * @typedef {{ offset: number, line: number, column: number }} DataPosition
 * @typedef {{ binding: string, kind: string, name: string | null, exported: boolean, start: DataPosition, end: DataPosition }} DataContractDeclaration
 * @typedef {{ binding: string, source: string | null, imported: string, site: string, start: DataPosition, end: DataPosition }} DataContractUse
 * @typedef {{ source: string, names: Array<[imported: string, exported: string]> | null }} DataReexport
 *   `export { a as b } from './x.data.ts'`, or `export * from` with null names
 */

/**
 * `contractExports` names the contracts a `*.data.ts` import specifier
 * exports, or returns null when it cannot tell; then every import from it
 * counts as a contract.
 *
 * @param {string} source
 * @param {string} filename
 * @param {(specifier: string) => ReadonlySet<string> | null} [contractExports]
 * @returns {{ declarations: DataContractDeclaration[], uses: DataContractUse[], reexports: DataReexport[], diagnostics: any[] }}
 */
export function analyzeDataContracts(source, filename, contractExports) {
	const ast = parseModule(source, filename);
	const lexical = createLexicalAnalysis(ast);
	const { rootScope, nodeScopes, resolveBinding } = lexical;
	const dataModule = DATA_MODULE.test(filename.replace(/[?#].*$/, ''));
	/** @type {DataContractDeclaration[]} */
	const declarations = [];
	/** @type {DataContractUse[]} */
	const uses = [];
	const diagnostics = [];
	const report = (code, node, message) =>
		diagnostics.push(diagnostic(code, filename, node, message));

	// Module-level facts: factory imports, contract imports, and what is exported.
	const factories = new Map();
	/** Contract bindings in the module scope: local name → where it comes from. */
	const contracts = new Map();
	const namespaces = new Map();
	const exported = new Set();
	const importedName = new Map();
	/** @type {DataReexport[]} */
	const reexports = [];
	for (const statement of ast.body) {
		if (
			(statement.type === 'ExportAllDeclaration' ||
				(statement.type === 'ExportNamedDeclaration' && statement.source != null)) &&
			statement.exportKind !== 'type' &&
			DATA_SPECIFIER.test(statement.source.value)
		) {
			const name = (node) => node.name ?? node.value;
			reexports.push({
				source: statement.source.value,
				names:
					statement.type === 'ExportAllDeclaration'
						? statement.exported == null
							? null
							: []
						: statement.specifiers.map((specifier) => [
								name(specifier.local),
								name(specifier.exported),
							]),
			});
		}
		if (statement.type === 'ImportDeclaration' && statement.importKind !== 'type') {
			const from = statement.source.value;
			for (const specifier of statement.specifiers) {
				if (specifier.importKind === 'type') continue;
				const local = specifier.local.name;
				const imported =
					specifier.type === 'ImportDefaultSpecifier'
						? 'default'
						: (specifier.imported?.name ?? specifier.imported?.value);
				if (imported !== undefined) importedName.set(local, imported);
				if (from === 'octane/data' && FACTORIES.has(imported)) factories.set(local, imported);
				else if (DATA_SPECIFIER.test(from)) {
					const known = contractExports?.(from) ?? null;
					if (specifier.type === 'ImportNamespaceSpecifier')
						namespaces.set(local, { source: from, known });
					else if (known === null || known.has(imported))
						contracts.set(local, { source: from, imported });
				}
			}
		} else if (statement.type === 'ExportNamedDeclaration' && statement.source == null) {
			for (const specifier of statement.specifiers) exported.add(specifier.local.name);
		} else if (statement.type === 'ExportDefaultDeclaration') {
			if (statement.declaration.type === 'Identifier') exported.add(statement.declaration.name);
		}
	}

	const resolved = (node) => resolveBinding(nodeScopes.get(node) ?? rootScope, node.name);
	const factoryOf = (call) =>
		call?.type === 'CallExpression' &&
		call.callee.type === 'Identifier' &&
		factories.has(call.callee.name) &&
		resolved(call.callee)?.scope === rootScope
			? factories.get(call.callee.name)
			: null;

	// Rule 1: each module-level declarator a factory initializes is a contract binding.
	const declared = new Set();
	const names = new Map();
	for (const statement of ast.body) {
		const isExport = statement.type === 'ExportNamedDeclaration';
		const declaration = isExport ? statement.declaration : statement;
		if (declaration?.type !== 'VariableDeclaration') continue;
		for (const declarator of declaration.declarations) {
			const call = unwrapTsExpr(declarator.init);
			const kind = factoryOf(call);
			if (kind === null || declarator.id.type !== 'Identifier') continue;
			const binding = declarator.id.name;
			declared.add(call);
			contracts.set(binding, { source: null, imported: binding });
			const name = contractName(kind, call);
			const record = {
				binding,
				kind,
				name,
				exported: isExport || exported.has(binding),
				start: position(declarator, 'start'),
				end: position(declarator, 'end'),
			};
			declarations.push(record);
			if (!dataModule) {
				report(
					DATA_CONTRACT_MODULE,
					declarator,
					`\`${binding}\` is declared outside a contract module. Declare contracts only in a module whose file name ends in \`.data.ts\` or \`.data.js\`.`,
				);
			}
			if (declaration.kind !== 'const') {
				report(
					DATA_CONTRACT_DECLARATION,
					declarator,
					`\`${binding}\` is declared with \`${declaration.kind}\`. Declare a contract with a module-level \`const\`.`,
				);
			}
			if (!record.exported) {
				report(
					DATA_CONTRACT_DECLARATION,
					declarator,
					`\`${binding}\` is not exported. Export every contract, directly or with \`export { ${binding} }\`.`,
				);
			}
			if (name === null) {
				report(
					DATA_CONTRACT_DECLARATION,
					call.arguments[0] ?? call,
					kind === 'entity'
						? `\`${binding}\` needs a string literal as its first argument, such as \`entity('book', shape)\`.`
						: `\`${binding}\` needs an options object with a string literal \`name\` and no spread, such as \`${kind}({ name: 'books.list', … })\`.`,
				);
			} else if (names.has(name)) {
				report(
					DATA_CONTRACT_DECLARATION,
					call.arguments[0],
					`\`${binding}\` reuses the name ${JSON.stringify(name)} of \`${names.get(name)}\`. Give each contract its own name.`,
				);
			} else names.set(name, binding);
		}
	}

	// Rule 2: a contract module stays inert, because the browser and the server both import it.
	if (dataModule) {
		for (const statement of ast.body) {
			const problem = contractModuleProblem(statement);
			if (problem !== null) report(DATA_CONTRACT_MODULE, statement, problem);
		}
	}

	// Rules 3 and 4. A loop alias is the parameter of a `.map` or `for…of` over
	// an inline array of contract references; it stands for exactly those.
	const aliases = new Map();
	/** A namespace import's member that is a known non-contract export, such as a shared schema. */
	const isPlainMember = (node) =>
		node.type === 'MemberExpression' &&
		!node.computed &&
		node.object.type === 'Identifier' &&
		namespaces.get(node.object.name)?.known?.has(node.property.name) === false &&
		resolved(node.object)?.scope === rootScope;
	/** The contracts an expression names directly, or null. */
	const contractsOf = (node) => {
		node = unwrapTsExpr(node);
		if (node?.type === 'Identifier') {
			const scope = resolved(node)?.scope;
			if (scope === rootScope && contracts.has(node.name)) {
				const { source, imported } = contracts.get(node.name);
				return [{ binding: node.name, source, imported }];
			}
			return (scope && aliases.get(scope)?.get(node.name)) ?? null;
		}
		if (
			node?.type === 'MemberExpression' &&
			!node.computed &&
			node.object.type === 'Identifier' &&
			namespaces.has(node.object.name) &&
			!isPlainMember(node) &&
			resolved(node.object)?.scope === rootScope
		) {
			const imported = node.property.name;
			return [
				{
					binding: `${node.object.name}.${imported}`,
					source: namespaces.get(node.object.name).source,
					imported,
				},
			];
		}
		return null;
	};
	/** An identifier that names a contract, an alias, or a contract namespace. */
	const isContractIdentifier = (node, parent, key) => {
		if (node.type !== 'Identifier' || !isIdentifierReference(node, parent, key, lexical))
			return false;
		const scope = resolved(node)?.scope;
		if (scope === rootScope) return contracts.has(node.name) || namespaces.has(node.name);
		return aliases.get(scope)?.has(node.name) === true;
	};
	// Stops at functions: a callback or method in a site position is walked as
	// ordinary code, so its own sites count and its escapes are still reported.
	const mentionsContract = (node) => {
		let found = false;
		walk(node, null, null, (child, parent, key) => {
			if (found || FUNCTIONS.has(child.type)) return false;
			found = isContractIdentifier(child, parent, key);
			return !found;
		});
		return found;
	};
	const inlineContracts = (array) => {
		array = unwrapTsExpr(array);
		if (array?.type !== 'ArrayExpression' || array.elements.length === 0) return null;
		const all = array.elements.map(contractsOf);
		return all.every(Boolean) ? all.flat() : null;
	};
	const alias = (pattern, targets) => {
		if (pattern?.type !== 'Identifier') return false;
		const scope = resolved(pattern)?.scope;
		if (!scope) return false;
		if (!aliases.has(scope)) aliases.set(scope, new Map());
		aliases.get(scope).set(pattern.name, targets);
		return true;
	};
	/** Check one contract position; returns false so the walk skips it. */
	const site = (node, name) => {
		node = unwrapTsExpr(node);
		// `defineHandler(Books, { … })` serves every read, write, and feed `Books` exports.
		const targets =
			name === 'defineHandler' &&
			node.type === 'Identifier' &&
			namespaces.has(node.name) &&
			resolved(node)?.scope === rootScope
				? [{ binding: node.name, source: namespaces.get(node.name).source, imported: '*' }]
				: (contractsOf(node) ?? inlineContracts(node));
		if (targets !== null) {
			for (const target of targets) {
				uses.push({
					...target,
					site: name,
					start: position(node, 'start'),
					end: position(node, 'end'),
				});
			}
			return false;
		}
		if (!mentionsContract(node)) return true;
		report(
			DATA_CONTRACT_ARGUMENT,
			node,
			`The contract passed to \`${name}\` is chosen at runtime. Name one contract binding here, such as \`${name}(setRead, …)\`; to vary the behaviour, pass the value in the contract's input.`,
		);
		return false;
	};

	const visit = (node, parent, key) => {
		if (node.type === 'CallExpression') {
			const kind = factoryOf(node);
			if (kind !== null && !declared.has(node)) {
				report(
					DATA_CONTRACT_DECLARATION,
					node,
					`This \`${kind}\` contract is built at runtime. Declare each contract as an exported module-level \`const\` with a literal name.`,
				);
			}
			const callee = unwrapTsExpr(node.callee);
			let index;
			let name;
			if (callee.type === 'MemberExpression' && !callee.computed) {
				name = callee.property.name;
				index = METHOD_SITES.get(name);
				// The bounded loop form: `[a, b].map((contract) => …)`.
				const targets = name === 'map' ? inlineContracts(callee.object) : null;
				if (targets !== null && alias(firstParam(node.arguments[0]), targets)) {
					walk(node.arguments, node, 'arguments', visit);
					return false;
				}
			} else if (callee.type === 'Identifier') {
				name = importedName.get(callee.name) ?? callee.name;
				index = FUNCTION_SITES.get(name);
			}
			const argument = index === undefined ? undefined : node.arguments[index];
			if (argument === undefined || site(argument, name)) return true;
			walk(callee, node, 'callee', visit);
			for (const other of node.arguments)
				if (other !== argument) walk(other, node, 'arguments', visit);
			return false;
		}
		if (node.type === 'ForOfStatement') {
			const targets = inlineContracts(node.right);
			const left = node.left.type === 'VariableDeclaration' ? node.left.declarations[0]?.id : null;
			if (targets === null || !alias(left, targets)) return true;
			walk(node.body, node, 'body', visit);
			return false;
		}
		if (node.type === 'Property' && !node.computed) {
			const name = node.key.name ?? node.key.value;
			if (PROPERTY_SITES.has(name)) {
				if (site(node.value, name)) walk(node.value, node, 'value', visit);
				return false;
			}
		}
		const named = node.type === 'MemberExpression' ? contractsOf(node) : null;
		if (named === null && isPlainMember(node)) return false;
		if (node.type === 'MemberExpression' && named === null && contractsOf(node.object) !== null) {
			// A property read off a contract, such as `books.view.compare`.
			if (node.computed) walk(node.property, node, 'property', visit);
			return false;
		}
		if (named === null && !isContractIdentifier(node, parent, key)) return true;
		if (parent?.type === 'ExportSpecifier' || parent?.type === 'ExportDefaultDeclaration')
			return false;
		const label = named?.[0].binding ?? node.name;
		report(
			DATA_CONTRACT_ESCAPE,
			node,
			`\`${label}\` is used outside a contract site, so the build cannot follow it. Pass it directly to a store method, hook, or handler, or pass a callback that names it, such as \`(store) => store.write(${label}, input)\`.`,
		);
		return false;
	};
	walk(ast, null, null, visit);
	diagnostics.sort((a, b) => a.start.offset - b.start.offset);
	return { declarations, uses, reexports, diagnostics };
}

/** Visits `node` and, unless `visit` returns false, its runtime children. */
function walk(node, parent, key, visit) {
	if (Array.isArray(node)) {
		for (const child of node) walk(child, parent, key, visit);
		return;
	}
	if (!node || typeof node.type !== 'string') return;
	if (visit(node, parent, key) === false) return;
	forEachRuntimeAstChild(node, (child, childKey) => walk(child, node, childKey, visit));
}

function firstParam(callback) {
	return callback?.type === 'ArrowFunctionExpression' || callback?.type === 'FunctionExpression'
		? callback.params[0]
		: null;
}

/** The literal name a factory call declares, or null when it is not statically known. */
function contractName(kind, call) {
	const first = call.arguments[0];
	if (kind === 'entity')
		return typeof first?.value === 'string' && first.type === 'Literal' ? first.value : null;
	if (first?.type !== 'ObjectExpression') return null;
	if (first.properties.some((property) => property.type !== 'Property')) return null;
	const name = first.properties.find(
		(property) => !property.computed && (property.key.name ?? property.key.value) === 'name',
	)?.value;
	return name?.type === 'Literal' && typeof name.value === 'string' ? name.value : null;
}

/** Why a contract module's top-level statement is not inert, or null. */
function contractModuleProblem(statement) {
	const source =
		statement.type === 'ImportDeclaration' || statement.source ? statement.source?.value : null;
	if (typeof source === 'string') {
		return SERVER_MODULES.some((server) => source === server || source.startsWith(`${server}/`))
			? `A contract module is imported by the browser too, so it cannot import \`${source}\`. Import contracts into the server module instead.`
			: null;
	}
	const declaration =
		statement.type === 'ExportNamedDeclaration' || statement.type === 'ExportDefaultDeclaration'
			? statement.declaration
			: statement;
	if (
		declaration === null ||
		(statement.type === 'ExportDefaultDeclaration' && declaration.type === 'Identifier') ||
		(declaration.type === 'VariableDeclaration' && declaration.kind === 'const') ||
		declaration.type === 'TSTypeAliasDeclaration' ||
		declaration.type === 'TSInterfaceDeclaration' ||
		typeof declaration.directive === 'string'
	) {
		return null;
	}
	return 'A contract module may contain only imports, types, and `const` declarations and exports, because the browser and the server both import it. Move this statement into a module that imports the contracts.';
}

function position(node, boundary) {
	const loc = boundary === 'end' ? node.loc?.end : node.loc?.start;
	return {
		offset: (boundary === 'end' ? node.end : node.start) ?? 0,
		line: loc?.line ?? 1,
		column: loc?.column ?? 0,
	};
}

function diagnostic(code, filename, node, message) {
	return {
		code,
		severity: 'error',
		filename,
		start: position(node, 'start'),
		end: position(node, 'end'),
		message,
		suggestions: [],
	};
}

// The whole-program half. It reads the project's sources from disk rather than
// following one bundle graph, so a client build sees the server's handlers, and
// the Vite and Rspack plugins and `octane analyze` reach the same verdict.

const DATA_CONTRACT_UNHANDLED = 'OCTANE_DATA_CONTRACT_UNHANDLED';
const DATA_CONTRACT_UNUSED = 'OCTANE_DATA_CONTRACT_UNUSED';

export const DATA_MANIFEST_MODULE = 'octane/data/manifest';
const SOURCE_FILE = /\.(?:tsrx|[cm]?[jt]sx?)$/;
const IGNORED_DIRECTORIES = new Set(['node_modules', 'dist', 'build', 'out', 'coverage']);
/** A source that names `octane/data` or imports a contract module. */
const MENTIONS_DATA = /octane\/data|\.data(?:\.[cm]?[jt]s)?['"]/;
/** Contracts a `createDataHandler` serves. */
const SERVED = new Set(['read', 'view', 'write', 'feed']);
const HANDLER_SITES = new Set(['handle', 'defineHandler']);
const RESOLVE_EXTENSIONS = ['.ts', '.js', '.mts', '.mjs', '.cts', '.cjs'];

/**
 * The project's octane/data facts. Each source is read once per change of its
 * modification time; `files` replaces the directory scan, as `octane analyze`
 * already has one.
 *
 * @param {string} root
 * @param {readonly string[]} [files]
 */
export function createDataProgram(root, files) {
	/** @type {string[] | null} */
	let listed = files ? [...files] : null;
	/** file → { stamp, source }, where a missing file has a null source. */
	const sources = new Map();
	/** file → { source, generation, specifiers, result } */
	const analyzed = new Map();
	// Bumped when a contract module's exports change, so importers are reanalyzed.
	let generation = 0;
	const exportsOf = new Map();
	// Modules being analyzed, so contract modules that import each other terminate.
	const active = new Set();

	const list = () => (listed ??= scan(root));
	const read = (file) => {
		let stamp = -1;
		try {
			const stat = statSync(file);
			stamp = stat.mtimeMs + stat.size;
		} catch {}
		let entry = sources.get(file);
		if (entry?.stamp !== stamp) {
			entry = { stamp, source: stamp < 0 ? null : readFileSync(file, 'utf8') };
			sources.set(file, entry);
		}
		return entry.source;
	};
	/** The contract module a relative `*.data` specifier names, or null. */
	const resolveDataModule = (specifier, importer) => {
		if (!DATA_SPECIFIER.test(specifier) || !(specifier[0] === '.' || isAbsolute(specifier)))
			return null;
		const base = resolve(dirname(importer), specifier);
		const candidates = DATA_MODULE.test(base)
			? [base, base.replace(/js$/, 'ts')]
			: RESOLVE_EXTENSIONS.map((extension) => base + extension);
		return candidates.find((candidate) => read(candidate) !== null) ?? null;
	};
	const analyze = (file, source) => {
		if (active.has(file)) return analyzed.get(file)?.result ?? null;
		active.add(file);
		try {
			return analyzeFresh(file, source);
		} finally {
			active.delete(file);
		}
	};
	const analyzeFresh = (file, source) => {
		const cached = analyzed.get(file);
		if (cached?.source === source) {
			// Refresh the contract modules it imports first, including ones that did
			// not exist yet: a new or changed export list bumps the generation.
			for (const specifier of cached.specifiers) {
				const target = resolveDataModule(specifier, file);
				if (target !== null) facts(target);
			}
			if (cached.generation === generation) return cached.result;
		}
		const specifiers = [];
		const result = analyzeDataContracts(source, file, (specifier) => {
			specifiers.push(specifier);
			const target = resolveDataModule(specifier, file);
			// A cycle partner's exports are not known yet; its own analysis bumps
			// the generation, so this module is analyzed again.
			if (target === null || active.has(target)) return null;
			facts(target);
			return exportsOf.get(target) ?? null;
		});
		if (DATA_MODULE.test(file)) {
			// A module that re-exports contracts has exports this module cannot list.
			const exported =
				result.reexports.length > 0
					? null
					: new Set(
							result.declarations
								.filter((declaration) => declaration.exported)
								.map((declaration) => declaration.binding),
						);
			const previous = exportsOf.get(file);
			if (
				previous === undefined ||
				String(previous && [...previous]) !== String(exported && [...exported])
			) {
				exportsOf.set(file, exported);
				generation++;
			}
		}
		analyzed.set(file, { source, generation, specifiers, result });
		return result;
	};
	/**
	 * A module's facts from disk, or null when it does not touch octane/data or
	 * does not parse: its own build reports the syntax error, not its importers.
	 */
	const facts = (file) => {
		const source = read(file);
		if (source === null || !MENTIONS_DATA.test(source)) return null;
		try {
			return analyze(file, source);
		} catch {
			return null;
		}
	};
	/** Every module's facts, keyed by file. */
	const all = () => {
		const result = new Map();
		for (const file of list()) {
			const found = facts(file);
			if (found !== null) result.set(file, found);
		}
		return result;
	};
	/** Each contract's declaration, by `file\0binding`, with its first name holder. */
	const declarationsOf = (modules) => {
		const declared = new Map();
		for (const [file, { declarations }] of [...modules].sort(([a], [b]) => (a < b ? -1 : 1))) {
			for (const declaration of declarations) {
				if (declaration.exported && declaration.name !== null)
					declared.set(`${file}\0${declaration.binding}`, { file, declaration });
			}
		}
		return declared;
	};

	return {
		/** Whether the application imports the generated manifest, which opts it in. */
		importsManifest() {
			for (const file of list()) if (read(file)?.includes(DATA_MANIFEST_MODULE)) return true;
			return false;
		},

		/** One module's own diagnostics (rules 1–4), from `source` or the file on disk. */
		check(file, source) {
			if ((source !== undefined && !MENTIONS_DATA.test(source)) || !SOURCE_FILE.test(file))
				return [];
			const path = relative(root, file);
			if (
				path.startsWith('..') ||
				isAbsolute(path) ||
				path.split(/[\\/]/).some((part) => part[0] === '.' || IGNORED_DIRECTORIES.has(part))
			)
				return [];
			source ??= read(file);
			if (source === null || !MENTIONS_DATA.test(source)) return [];
			try {
				return analyze(file, source)?.diagnostics ?? [];
			} catch {
				// A syntax error is the compiler's to report.
				return [];
			}
		},

		/** Handler coverage, unused contracts, and names shared across modules. */
		report() {
			const modules = all();
			const declared = declarationsOf(modules);
			/** The declaring module's key for `name` exported by `file`, through re-exports. */
			const canonical = (file, name, seen = new Set()) => {
				const key = `${file}\0${name}`;
				if (declared.has(key) || seen.has(file)) return declared.has(key) ? key : null;
				seen.add(file);
				for (const { source, names } of modules.get(file)?.reexports ?? []) {
					const target = resolveDataModule(source, file);
					const pair = names?.find(([, exported]) => exported === name);
					const found =
						target === null || (names !== null && pair === undefined)
							? null
							: canonical(target, pair?.[0] ?? name, seen);
					if (found !== null) return found;
				}
				return null;
			};
			/** Every name `file` exports, through re-exports. */
			const exportNames = (file, seen = new Set()) => {
				if (seen.has(file)) return [];
				seen.add(file);
				const facts = modules.get(file);
				const names = (facts?.declarations ?? [])
					.filter((declaration) => declaration.exported)
					.map((declaration) => declaration.binding);
				for (const { source, names: pairs } of facts?.reexports ?? []) {
					const target = resolveDataModule(source, file);
					if (pairs !== null) names.push(...pairs.map(([, exported]) => exported));
					else if (target !== null) names.push(...exportNames(target, seen));
				}
				return names;
			};
			const handled = new Map();
			const calls = new Map();
			const used = new Set();
			for (const [file, { uses }] of modules) {
				for (const use of uses) {
					const target = use.source === null ? file : resolveDataModule(use.source, file);
					if (target === null) continue;
					if (use.imported === '*') {
						for (const name of new Set(exportNames(target))) {
							const key = canonical(target, name);
							if (key !== null && SERVED.has(declared.get(key).declaration.kind))
								handled.set(key, (handled.get(key) ?? 0) + 1);
						}
						continue;
					}
					const key = canonical(target, use.imported) ?? `${target}\0${use.imported}`;
					used.add(key);
					if (HANDLER_SITES.has(use.site)) handled.set(key, (handled.get(key) ?? 0) + 1);
					// A contract module's own sites, such as `view({ of })`, declare rather than call.
					else if (!DATA_MODULE.test(file) && !calls.has(key))
						calls.set(key, `${relativeTo(root, file)}:${use.start.line}`);
				}
			}
			const diagnostics = [];
			const names = new Map();
			for (const [key, { file, declaration }] of declared) {
				const { binding, kind, name } = declaration;
				const node = { start: declaration.start.offset, end: declaration.end.offset };
				node.loc = { start: declaration.start, end: declaration.end };
				const first = names.get(name);
				if (first === undefined) names.set(name, { file, binding });
				else if (first.file !== file) {
					diagnostics.push(
						diagnostic(
							DATA_CONTRACT_DECLARATION,
							file,
							node,
							`\`${binding}\` reuses the name ${JSON.stringify(name)} of \`${first.binding}\` in ${relativeTo(root, first.file)}. Give each contract its own name.`,
						),
					);
				}
				const count = handled.get(key) ?? 0;
				const call = calls.get(key);
				if (SERVED.has(kind) && (count > 1 || (count === 0 && call !== undefined))) {
					diagnostics.push(
						diagnostic(
							DATA_CONTRACT_UNHANDLED,
							file,
							node,
							count > 1
								? `\`${binding}\` is handled ${count} times. Serve each contract from one \`handle(${binding}, …)\` or \`defineHandler\` entry.`
								: `\`${binding}\` is used in ${call}, but no \`createDataHandler\` serves it. Add \`handle(${binding}, …)\`, or serve its module with \`defineHandler\`.`,
						),
					);
				} else if (kind === 'entity' ? !used.has(key) : call === undefined) {
					diagnostics.push({
						...diagnostic(
							DATA_CONTRACT_UNUSED,
							file,
							node,
							count > 0
								? `\`${binding}\` is served, but nothing in the app uses it. Remove it and its handler, or use it from the app.`
								: `\`${binding}\` is declared but never used. Remove it, or use it from the app.`,
						),
						severity: 'hint',
					});
				}
			}
			return diagnostics;
		},

		/**
		 * The source of `octane/data/manifest`, and the contract modules it
		 * reads. `identity` is the shape `createReplica` compares at runtime,
		 * not a hash of declaration text: a contract's output schema may come
		 * from another module, and a formatting edit must not split owners.
		 */
		manifest() {
			const files = list().filter((file) => DATA_MODULE.test(file));
			const modules = new Map();
			for (const file of files) {
				const found = facts(file);
				if (found !== null) modules.set(file, found);
			}
			const seen = new Set();
			const entries = [];
			for (const { file, declaration } of declarationsOf(modules).values()) {
				if (!SERVED.has(declaration.kind) || seen.has(declaration.name)) continue;
				seen.add(declaration.name);
				entries.push({ file, declaration });
			}
			entries.sort((a, b) => (a.declaration.name < b.declaration.name ? -1 : 1));
			const imports = new Map();
			const locals = entries.map(({ file, declaration }, index) => {
				if (!imports.has(file)) imports.set(file, []);
				imports.get(file).push(`${declaration.binding} as c${index}`);
				return `c${index}`;
			});
			const writes = locals.filter((_, index) => entries[index].declaration.kind === 'write');
			const code =
				`import { contractIdentity } from 'octane/data';\n` +
				[...imports]
					.map(
						([file, names]) =>
							`import { ${names.join(', ')} } from ${JSON.stringify(file.replaceAll('\\', '/'))};\n`,
					)
					.join('') +
				`export const contracts = [${locals.join(', ')}];\n` +
				`export const writes = [${writes.join(', ')}];\n` +
				`export const identity = contractIdentity(contracts);\n`;
			// Every contract module, including one that does not parse yet, so
			// fixing it regenerates the manifest.
			return { code, files };
		},

		/**
		 * Forget a changed file, or with none, every file. A created or deleted
		 * source rescans the project.
		 * Returns whether it is a contract module, whose change the manifest sees.
		 */
		invalidate(file) {
			sources.delete(file);
			const listChanged =
				file === undefined ||
				listed?.includes(file) !== (SOURCE_FILE.test(file) && existsSync(file));
			if (!files && listChanged) listed = null;
			return file !== undefined && DATA_MODULE.test(file);
		},
	};
}

/** Project sources under `root`, outside dependencies, build output, and dot directories. */
function scan(root) {
	const found = [];
	const queue = [root];
	while (queue.length > 0) {
		const directory = queue.pop();
		let entries;
		try {
			entries = readdirSync(directory, { withFileTypes: true });
		} catch {
			continue;
		}
		for (const entry of entries) {
			if (entry.name[0] === '.') continue;
			const path = join(directory, entry.name);
			if (entry.isDirectory()) {
				if (!IGNORED_DIRECTORIES.has(entry.name)) queue.push(path);
			} else if (SOURCE_FILE.test(entry.name) && !entry.name.endsWith('.d.ts')) found.push(path);
		}
	}
	return found.sort();
}

function relativeTo(root, file) {
	return relative(root, file).replaceAll('\\', '/');
}

/** One diagnostic as a build reports it: `file:line:column [CODE] message`. */
export function formatDataDiagnostic(diagnostic, root) {
	const { filename, start, code, message } = diagnostic;
	return `${relativeTo(root, filename)}:${start.line}:${start.column + 1} [${code}] ${message}`;
}
