/**
 * Token-contract machinery for `CompileOptions.resolveTokenContract` (U10, R5).
 *
 * A theme-token contract is a plain `.ts` module declaring
 * `defineThemeTokens(tree, { prefix })` (octane/theme-tokens). Hosts resolve an
 * authored import request to that module, read it WITHOUT evaluating it, and
 * reduce it to serializable facts `{ namespace, names }` — the same
 * host-facts shape as `resolveCssModuleConstant`/`textTypeFacts`. The compiler
 * pass in `./style-correctness.js` (`analyzeTokenContracts`) then checks
 * `var(--name)` references inside scoped `<style>` blocks: a name is claimed by
 * a contract iff it starts with the contract's `namespace` (`--{prefix}-`).
 *
 * Claim boundary: an unprefixed contract resolves to namespace `'--'`, which
 * would claim every `var(--*)` in the file — collapsing the R5 legacy
 * carve-out for linked `.css` token files and inline custom properties. The
 * enforcement side therefore ignores `'--'` namespaces entirely: unprefixed
 * contracts stay legal but unenforced. Give the contract a `prefix` to make
 * its references checked.
 *
 * Resolver tri-state per request: facts (enforce) / `null` (the request named
 * a contract-marked module that could not be reduced to facts →
 * `octane-style-token-contract-unresolved` warning) / `undefined` (not a
 * contract → silent). A module declaring multiple contracts resolves to a
 * list of facts, one per distinct prefix.
 *
 * This module stays free of Node builtins so `octane/compiler` remains
 * browser-safe: the synchronous filesystem resolver takes `{ existsSync,
 * readFileSync }` from the host (`octane analyze`, MCP `octane_compile`,
 * tests); the bundler plugin reads through its own graph context instead.
 */

import { parseModule } from '@tsrx/core';

const RELATIVE_REQUEST = /^\.{1,2}\//;
const CONTRACT_MARKER = 'defineThemeTokens';
/** `var(--name` inside a declaration value; also the cheap source prefilter. */
export const TOKEN_REFERENCE = /var\(\s*(--[\w-]+)/;
/** Global variant for `matchAll` — never `.test()` a /g regex (lastIndex state). */
export const TOKEN_REFERENCE_ALL = new RegExp(TOKEN_REFERENCE.source, 'g');

/**
 * Whether the source can contain a `var(--…)` reference at all. Gates the
 * whole pass before any import is probed: a file with no token references has
 * nothing to verify, so even a claimed-but-unreadable contract stays silent.
 */
export function sourceMayReferenceTokens(source) {
	return TOKEN_REFERENCE.test(source);
}

/**
 * `findCssModuleImportRequests` analogue: authored, non-type, attribute-free
 * relative imports with at least one value specifier are candidate contract
 * requests (`import './x'` side-effect-only and `import type` are not claims).
 *
 * @param {any} program analyzed parser Program
 * @returns {Map<string, any>} request → its source Literal node
 */
export function findTokenContractImportRequests(program) {
	/** @type {Map<string, any>} */
	const requests = new Map();
	for (const statement of program?.body ?? []) {
		if (
			statement?.type !== 'ImportDeclaration' ||
			statement.importKind === 'type' ||
			statement.attributes?.length > 0 ||
			statement.assertions?.length > 0 ||
			typeof statement.source?.value !== 'string' ||
			!RELATIVE_REQUEST.test(statement.source.value) ||
			!statement.specifiers?.some((specifier) => specifier.importKind !== 'type')
		) {
			continue;
		}
		if (!requests.has(statement.source.value))
			requests.set(statement.source.value, statement.source);
	}
	return requests;
}

function unwrapTs(node) {
	while (
		node?.type === 'TSAsExpression' ||
		node?.type === 'TSSatisfiesExpression' ||
		node?.type === 'TSTypeAssertion' ||
		node?.type === 'TSNonNullExpression' ||
		node?.type === 'ParenthesizedExpression'
	) {
		node = node.expression;
	}
	return node;
}

function propertyKey(node) {
	if (node?.type === 'Identifier') return node.name;
	if (node?.type === 'Literal' || node?.type === 'StringLiteral') return String(node.value);
	return undefined;
}

/** Every leaf of a declared tree is a `--{prefix-}{dashed-path}` name. */
function collectNames(node, path, prefix, out) {
	if (node?.type !== 'ObjectExpression') return false;
	for (const property of node.properties ?? []) {
		if (
			property?.type !== 'Property' ||
			property.kind !== 'init' ||
			property.computed === true ||
			property.method === true
		) {
			return false;
		}
		const key = propertyKey(property.key);
		if (key === undefined || key === '__proto__') return false;
		const value = unwrapTs(property.value);
		if (value?.type === 'ObjectExpression') {
			if (!collectNames(value, [...path, key], prefix, out)) return false;
		} else if (typeof value?.value === 'string' || typeof value?.value === 'number') {
			out.push(`--${prefix}${[...path, key].join('-')}`);
		} else {
			return false;
		}
	}
	return true;
}

/**
 * Reduce one `defineThemeTokens(tree, options?)` call to facts, or undefined
 * when any part is not a statically-known literal (the caller turns that into
 * the `null` "claimed but unreadable" probe).
 */
function extractContractFacts(call) {
	const tree = unwrapTs(call.arguments?.[0]);
	if (tree?.type !== 'ObjectExpression') return undefined;
	let prefix = '';
	const options = unwrapTs(call.arguments?.[1]);
	if (options !== undefined) {
		if (options?.type !== 'ObjectExpression') return undefined;
		for (const property of options.properties ?? []) {
			if (property?.type !== 'Property' || property.computed === true) return undefined;
			if (propertyKey(property.key) !== 'prefix') continue;
			const value = unwrapTs(property.value);
			if (typeof value?.value !== 'string') return undefined;
			prefix = value.value === '' ? '' : `${value.value}-`;
		}
	}
	const names = [];
	if (!collectNames(tree, [], prefix, names)) return undefined;
	return { namespace: `--${prefix}`, names };
}

/**
 * The local names bound to `defineThemeTokens` by this module's imports —
 * the callee may be aliased (`import { defineThemeTokens as dtt }`). A call
 * through a member (`x.defineThemeTokens`) is never a declaration.
 */
function contractCalleeNames(ast) {
	const names = new Set([CONTRACT_MARKER]);
	for (const statement of ast?.body ?? []) {
		if (statement?.type !== 'ImportDeclaration') continue;
		for (const specifier of statement.specifiers ?? []) {
			if (
				specifier?.type === 'ImportSpecifier' &&
				(specifier.imported?.name ?? specifier.imported?.value) === CONTRACT_MARKER &&
				specifier.local?.type === 'Identifier'
			) {
				names.add(specifier.local.name);
			}
		}
	}
	return names;
}

/**
 * `readCssModuleExports` analogue: statically read an authored contract module
 * without evaluating it. The `defineThemeTokens` substring is the cheap claim
 * marker; extraction accepts only literal trees. Returns facts (a single
 * `{namespace, names}` object, or a list when the module declares contracts
 * under distinct prefixes), `null` for a contract-marked module that could not
 * be reduced, or `undefined` when the module is not a contract.
 */
export function readTokenContractModule(source, id) {
	if (typeof source !== 'string' || !source.includes(CONTRACT_MARKER)) return undefined;
	let ast;
	try {
		ast = parseModule(source, id);
	} catch {
		return null;
	}
	const callees = contractCalleeNames(ast);
	const facts = [];
	let claimed = false;
	for (const statement of ast?.body ?? []) {
		const declaration =
			statement?.type === 'ExportNamedDeclaration' ? statement.declaration : statement;
		if (declaration?.type !== 'VariableDeclaration' || declaration.kind !== 'const') continue;
		for (const item of declaration.declarations ?? []) {
			const call = unwrapTs(item.init);
			if (
				call?.type !== 'CallExpression' ||
				call.callee?.type !== 'Identifier' ||
				!callees.has(call.callee.name)
			) {
				continue;
			}
			claimed = true;
			const extracted = extractContractFacts(call);
			if (extracted === undefined) return null;
			facts.push(extracted);
		}
	}
	if (!claimed) return null; // marker present but no literal declaration found
	if (facts.length === 1) return facts[0];
	// Merge contracts that share a namespace prefix; distinct prefixes need
	// separate facts so each reference is claimed by its own contract.
	const byNamespace = new Map();
	for (const fact of facts) {
		const existing = byNamespace.get(fact.namespace);
		if (existing === undefined) byNamespace.set(fact.namespace, [...fact.names]);
		else existing.push(...fact.names);
	}
	return [...byNamespace].map(([namespace, names]) => ({ namespace, names }));
}

const CONTRACT_CANDIDATES = (base) => [
	base,
	`${base}.ts`,
	`${base}.tsx`,
	`${base}.tsrx`,
	`${base}.js`,
	`${base}.jsx`,
	`${base}.mjs`,
	`${base}/index.ts`,
	`${base}/index.tsx`,
	`${base}/index.js`,
];

/**
 * The synchronous host resolver for `octane analyze`, MCP `octane_compile`,
 * and tests: resolve a relative request against the importer's directory and
 * read the contract module straight from disk. Memoized per resolved file —
 * the host owns invalidation (analyze compiles each file once; watchers clear
 * their own caches on change).
 *
 * @param {{ existsSync(path: string): boolean, readFileSync(path: string, encoding: 'utf8'): string }} fs
 *   injected so this module carries no `node:fs` import (`octane/compiler`
 *   must stay browser-importable).
 */
export function createSyncTokenContractResolver(fs) {
	// Cheap path arithmetic, no node:path dependency: the filesystem resolves
	// `./`/`../` segments, so joining with '/' is enough on every host.
	const dirname = (file) => {
		const cut = Math.max(file.lastIndexOf('/'), file.lastIndexOf('\\'));
		return cut < 0 ? '.' : file.slice(0, cut);
	};
	const cache = new Map();
	return function resolveTokenContract(request, importer) {
		if (typeof request !== 'string' || !RELATIVE_REQUEST.test(request)) return undefined;
		const base = `${dirname(importer)}/${request}`;
		for (const candidate of CONTRACT_CANDIDATES(base)) {
			if (!fs.existsSync(candidate)) continue;
			if (cache.has(candidate)) return cache.get(candidate);
			let source;
			try {
				source = fs.readFileSync(candidate, 'utf8');
			} catch {
				// existsSync is true for directories — an unreadable hit is a miss,
				// not the resolved module (`./tokens/` then `./tokens/index.ts`).
				continue;
			}
			const facts = readTokenContractModule(source, candidate);
			cache.set(candidate, facts);
			return facts;
		}
		return undefined;
	};
}
