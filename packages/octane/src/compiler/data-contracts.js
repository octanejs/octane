// The per-module half of the octane/data contract check
// (docs/data-contract-conventions.md). It finds a module's contract
// declarations and the sites that use them, and reports rules 1–4. The
// whole-program pass (handler coverage, unused and duplicate names, the
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
/** Function sites, by imported name (or local name for `createDataHandler`'s `handle`). */
const FUNCTION_SITES = new Map([
	['useForm', 0],
	['handle', 0],
	['pages', 1],
	['listen', 1],
]);
/** `view({ of })`, `write({ creates, patches, removes })`, and a FeedChange's `put`, `remove`, `read`. */
const PROPERTY_SITES = new Set(['of', 'creates', 'patches', 'removes', 'put', 'remove', 'read']);

/**
 * @typedef {{ offset: number, line: number, column: number }} DataPosition
 * @typedef {{ binding: string, kind: string, name: string | null, exported: boolean, start: DataPosition, end: DataPosition }} DataContractDeclaration
 * @typedef {{ binding: string, source: string | null, imported: string, site: string, start: DataPosition, end: DataPosition }} DataContractUse
 */

/**
 * @param {string} source
 * @param {string} filename
 * @returns {{ declarations: DataContractDeclaration[], uses: DataContractUse[], diagnostics: any[] }}
 */
export function analyzeDataContracts(source, filename) {
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
	for (const statement of ast.body) {
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
					if (specifier.type === 'ImportNamespaceSpecifier') namespaces.set(local, from);
					else contracts.set(local, { source: from, imported });
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
			resolved(node.object)?.scope === rootScope
		) {
			const imported = node.property.name;
			return [
				{
					binding: `${node.object.name}.${imported}`,
					source: namespaces.get(node.object.name),
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
	const mentionsContract = (node) => {
		let found = false;
		walk(node, null, null, (child, parent, key) => {
			if (found) return false;
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
		const targets = contractsOf(node);
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
	return { declarations, uses, diagnostics };
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
