import { builders as b, strongHash } from '@tsrx/core';
import { createLexicalAnalysis } from './compile-universal.js';
import { analyzeCallbackDependencies, cloneDependency, isInvariantLiteral } from './hook-deps.js';
import { inheritHookMemoOrigin } from './inline-hook-memo.js';
import { normalizeTextTypeFilename } from './text-type-facts.js';

const SIGNAL_MODULES = new Set([
	'octane/signals',
	'octane/signals/client',
	'octane/signals/server',
]);

const SIGNAL_FACTORIES = new Map([
	['signal$', '__signalAt'],
	['derived$', '__derivedAt'],
	['query$', '__queryAt'],
]);

const SCALAR_UNARY_OPERATORS = new Set(['!', '+', '-', '~', 'typeof', 'void']);
const SCALAR_BINARY_OPERATORS = new Set([
	'-',
	'*',
	'/',
	'%',
	'**',
	'|',
	'&',
	'^',
	'<<',
	'>>',
	'>>>',
	'==',
	'!=',
	'===',
	'!==',
	'<',
	'>',
	'<=',
	'>=',
	'in',
	'instanceof',
]);

function unwrapExpression(node) {
	while (
		node?.type === 'TSAsExpression' ||
		node?.type === 'TSTypeAssertion' ||
		node?.type === 'TSSatisfiesExpression' ||
		node?.type === 'TSNonNullExpression' ||
		node?.type === 'ParenthesizedExpression'
	)
		node = node.expression;
	return node;
}

// These syntax forms either return primitives or throw. Type annotations and
// calls (even an unshadowed, but globally replaceable String) are not proof.
function isScalarResult(expression) {
	const node = unwrapExpression(expression);
	if (!node) return false;
	if (node.type === 'Literal') {
		return (
			node.regex === undefined &&
			(node.value === null || ['string', 'number', 'boolean', 'bigint'].includes(typeof node.value))
		);
	}
	if (node.type === 'TemplateLiteral') return true;
	if (node.type === 'UnaryExpression') return SCALAR_UNARY_OPERATORS.has(node.operator);
	if (node.type === 'BinaryExpression') return SCALAR_BINARY_OPERATORS.has(node.operator);
	if (node.type === 'ConditionalExpression') {
		return isScalarResult(node.consequent) && isScalarResult(node.alternate);
	}
	if (node.type === 'LogicalExpression') {
		return isScalarResult(node.left) && isScalarResult(node.right);
	}
	return false;
}

function declarationHelper(factory, call) {
	if (factory !== 'derived$') return SIGNAL_FACTORIES.get(factory);
	const args = call.arguments ?? [];
	const compute = unwrapExpression(args[0]);
	if (
		(compute?.type !== 'ArrowFunctionExpression' && compute?.type !== 'FunctionExpression') ||
		compute.params.length !== 0
	)
		return '__derivedAt';
	const options = unwrapExpression(args[1]);
	if (options !== undefined) {
		// A stable key does not change the result proof. Unknown options, spreads
		// and accessors can change the sync assertion, so retain the general path.
		if (options.type !== 'ObjectExpression') return '__derivedAt';
		let sync;
		const seen = new Set();
		for (const property of options.properties) {
			const key = property.key?.name ?? property.key?.value;
			if (
				property.type !== 'Property' ||
				property.kind !== 'init' ||
				property.computed ||
				seen.has(key)
			)
				return '__derivedAt';
			seen.add(key);
			if (key === 'key' && validLiteralKey(property.value)) continue;
			if (key !== 'sync' || property.value?.type !== 'Literal') return '__derivedAt';
			sync = property.value.value;
		}
		if (seen.has('sync')) return sync === true ? '__derivedScalarAt' : '__derivedAt';
	}
	if (compute.async || compute.generator) return '__derivedAt';
	const result =
		compute.body.type === 'BlockStatement'
			? compute.body.body.length === 1 && compute.body.body[0].type === 'ReturnStatement'
				? compute.body.body[0].argument
				: undefined
			: compute.body;
	return isScalarResult(result) ? '__derivedScalarAt' : '__derivedAt';
}

function validLiteralKey(value) {
	return value?.type === 'Literal' && typeof value.value === 'string' && value.value.trim() !== '';
}

// The runtime helper a captured `root.method(...)` read lists, as hook
// dependency inference does. The signal entries re-export it.
const METHOD_DEP = '__methodDep';

// Positional parameters before the captures argument of each lowered factory:
// derived$(compute, options) and query$(select, load, options).
const CAPTURE_INDEX = new Map([
	['derived$', 2],
	['query$', 3],
]);

function plainOptions(options, allowed) {
	if (options.type !== 'ObjectExpression') return false;
	for (const property of options.properties) {
		if (
			property.type !== 'Property' ||
			property.kind !== 'init' ||
			property.computed ||
			property.method
		)
			return false;
		if (!allowed(property.key?.name ?? property.key?.value, unwrapExpression(property.value)))
			return false;
	}
	return true;
}

/**
 * `const value$ = signal$(initial)` names one cell for its scope's lifetime:
 * every render's handle resolves to it, and a later initial value is ignored.
 * A dynamic key could name another cell.
 */
function stableSignalDeclaration(call) {
	const args = call.arguments ?? [];
	if (args.length === 0 || args.length > 2 || args.some((arg) => arg.type === 'SpreadElement'))
		return false;
	const options = unwrapExpression(args[1]);
	return (
		options === undefined ||
		(options.type === 'Literal' && options.value === null) ||
		plainOptions(options, (key, value) => key !== 'key' || validLiteralKey(value))
	);
}

/**
 * List the render values each local derived$ and query$ declaration captures,
 * with the same inference as an omitted hook dependency list. A render that
 * captured the committed values keeps the committed definition instead of
 * re-running it. Declarations whose captures cannot be listed keep the
 * re-evaluating path.
 */
function analyzeSignalCaptures(ast, declarations) {
	const stable = new WeakSet();
	const pending = [];
	const callbacks = [];
	// Captures are read where the declaration runs, before its closures do.
	const evaluatedAt = new Map();
	for (const { node, factory } of declarations) {
		if (factory === 'signal$') {
			if (stableSignalDeclaration(node)) stable.add(node);
			continue;
		}
		const args = node.arguments ?? [];
		const index = CAPTURE_INDEX.get(factory);
		if (args.length > index || args.some((arg) => arg.type === 'SpreadElement')) continue;
		const sources = args.slice(0, index - 1);
		if (sources.length !== index - 1) continue;
		// Derived options apply only when a cell is created; query options select
		// the request kind on every declaration.
		const options = unwrapExpression(args[index - 1]);
		if (
			factory === 'query$' &&
			options !== undefined &&
			!(options.type === 'Literal' && options.value === null)
		) {
			if (options.type === 'ObjectExpression') {
				if (!plainOptions(options, (_key, value) => isInvariantLiteral(value))) continue;
			} else sources.push(options);
		}
		pending.push({ node, sources });
		for (const source of sources) {
			callbacks.push(source);
			evaluatedAt.set(source, node.start);
		}
	}
	const captures = new Map();
	if (pending.length === 0) return captures;
	const inferred = analyzeCallbackDependencies(ast, callbacks, {
		invariantCall: (call) => stable.has(call),
		evaluatedAt: (callback) => evaluatedAt.get(callback),
	});
	outer: for (const { node, sources } of pending) {
		const list = [];
		const seen = new Set();
		for (const source of sources) {
			const dependencies = inferred.get(source);
			if (dependencies == null) continue outer;
			for (const dependency of dependencies) {
				const key = dependency.method?.guarded ? `${dependency.key}?` : dependency.key;
				if (seen.has(key)) continue;
				seen.add(key);
				list.push(dependency);
			}
		}
		captures.set(node, list);
	}
	return captures;
}

function captureExpression(dependency, helper) {
	if (!dependency.method) return cloneDependency(dependency.node);
	const origin = dependency.node;
	const { root, name, guarded } = dependency.method;
	return inheritHookMemoOrigin(
		{
			...b.call(
				helper(),
				{ ...root },
				b.literal(name, JSON.stringify(name)),
				...(guarded ? [b.literal(true, 'true')] : []),
			),
			start: origin.start,
			end: origin.end,
			loc: origin.loc,
		},
		origin,
	);
}

function captureSource(dependency, source, helper) {
	if (!dependency.method) return source.slice(dependency.node.start, dependency.node.end);
	const { root, name, guarded } = dependency.method;
	return `${helper()}(${root.name}, ${JSON.stringify(name)}${guarded ? ', true' : ''})`;
}

// Parser expression ranges omit grouping parentheses. Append at the call
// delimiter so the captures never become part of an authored comma expression.
function captureSeparator(node, source) {
	const tail = source
		.slice(node.arguments.at(-1)?.end ?? node.start, node.end - 1)
		.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '')
		.trimEnd();
	return tail.endsWith(',') ? ' ' : ', ';
}

// Declarations create lazy descriptors, not live cells. Only omit construction
// when its validation and eager option reads are provably unobservable; a PURE
// call still evaluates any effectful arguments. Unknown callbacks, observable
// option reads, and malformed overloads must keep their effects and diagnostics.
function pureSignalDeclaration(factory, call) {
	const args = call.arguments ?? [];
	if (args.some((argument) => argument.type === 'SpreadElement')) return false;
	const functionAt = (index) => {
		const value = unwrapExpression(args[index]);
		return value?.type === 'ArrowFunctionExpression' || value?.type === 'FunctionExpression';
	};
	const count = factory === 'query$' ? 2 : 1;
	if (args.length < count || args.length > count + 1) return false;
	if (factory !== 'signal$' && !functionAt(0)) return false;
	if (factory === 'query$' && !functionAt(1)) return false;
	const options = unwrapExpression(args[count]);
	if (options === undefined || (options.type === 'Literal' && options.value === null)) return true;
	if (options.type !== 'ObjectExpression') return false;
	let ownsKey = false;
	for (const property of options.properties) {
		if (property.type !== 'Property' || property.computed) return false;
		const key = property.key?.name ?? property.key?.value;
		// sync is read only when a general derived cell starts, never at declaration.
		if (factory === 'derived$' && key === 'sync') continue;
		if (property.kind !== 'init') return false;
		if (key === 'key' && validLiteralKey(property.value)) {
			ownsKey = true;
			continue;
		}
		if (
			factory === 'query$' &&
			key === 'kind' &&
			property.value?.type === 'Literal' &&
			(property.value.value === 'promise' || property.value.value === 'stream')
		)
			continue;
		return false;
	}
	// Without an own field the declaration can observe an inherited key accessor.
	return ownsKey;
}

const AST_METADATA = new Set([
	'loc',
	'start',
	'end',
	'range',
	'metadata',
	'parent',
	'leadingComments',
	'trailingComments',
	'innerComments',
	'comments',
]);

function identifierNames(root) {
	const names = new Set();
	const seen = new WeakSet();
	function visit(node) {
		if (node === null || typeof node !== 'object' || seen.has(node)) return;
		seen.add(node);
		if (Array.isArray(node)) {
			for (const child of node) visit(child);
			return;
		}
		if (node.type === 'Identifier') names.add(node.name);
		for (const key in node) {
			if (!AST_METADATA.has(key) && !key.startsWith('_octane')) visit(node[key]);
		}
	}
	visit(root);
	return names;
}

function allocateName(used, preferred) {
	let name = preferred;
	let suffix = 0;
	while (used.has(name)) name = `${preferred}$${++suffix}`;
	used.add(name);
	return name;
}

function functionOwner(node, parent) {
	let name = node.id?.name;
	if (
		name === undefined &&
		parent?.type === 'VariableDeclarator' &&
		parent.id?.type === 'Identifier'
	) {
		name = parent.id.name;
	}
	if (name === undefined && parent?.type === 'Property' && parent.computed !== true) {
		name = parent.key?.name ?? parent.key?.value;
	}
	return `${name ?? '<anonymous>'}@${node.start ?? 0}`;
}

function lexicalOwners(root) {
	const owners = new WeakMap();
	const seen = new WeakSet();
	function visit(node, path, parent = null) {
		if (node === null || typeof node !== 'object' || seen.has(node)) return;
		seen.add(node);
		if (Array.isArray(node)) {
			for (const child of node) visit(child, path, parent);
			return;
		}
		let childPath = path;
		if (
			node.type === 'FunctionDeclaration' ||
			node.type === 'FunctionExpression' ||
			node.type === 'ArrowFunctionExpression'
		) {
			childPath = [...path, functionOwner(node, parent)];
		}
		owners.set(node, childPath);
		for (const key in node) {
			if (!AST_METADATA.has(key) && !key.startsWith('_octane')) visit(node[key], childPath, node);
		}
	}
	visit(root, ['module']);
	return owners;
}

function mapAst(node, replace) {
	if (node === null || typeof node !== 'object') return node;
	if (Array.isArray(node)) {
		let out = null;
		for (let i = 0; i < node.length; i++) {
			const mapped = mapAst(node[i], replace);
			if (out === null && mapped !== node[i]) out = node.slice(0, i);
			if (out !== null) out.push(mapped);
		}
		return out ?? node;
	}
	const replacement = replace(node);
	if (replacement !== null) node = replacement;
	let out = null;
	for (const key in node) {
		if (AST_METADATA.has(key) || key.startsWith('_octane')) continue;
		const child = node[key];
		if (child === null || typeof child !== 'object') continue;
		const mapped = mapAst(child, replace);
		if (mapped !== child) {
			out ??= { ...node };
			out[key] = mapped;
		}
	}
	return out ?? node;
}

function propertyName(member) {
	if (member.computed === true) {
		return member.property?.type === 'Literal' && typeof member.property.value === 'string'
			? member.property.value
			: null;
	}
	return member.property?.name ?? null;
}

function signalSite(filename, owner, node) {
	const position = node.start ?? `${node.loc?.start?.line ?? 0}:${node.loc?.start?.column ?? 0}`;
	const scope = owner.length === 1 ? 'g' : 'i';
	return `${scope}:${strongHash(
		`octane:signal-site:2\0${filename}\0${owner.join('/')}\0${position}`,
	)}`;
}

/**
 * Instance declarations reached through a custom hook are keyed by its call
 * sites (see signals/declaration-path.ts). Runtime slot numbers follow module
 * evaluation order, so hash the authored line:column instead, as component
 * invocation sites do: server and client compiles of one call always agree.
 */
export function signalHookCallSite(filename, node) {
	const start = node?.loc?.start;
	const position =
		start != null ? `${start.line ?? 0}:${start.column ?? 0}` : (node?.start ?? '0:0');
	return `h:${strongHash(
		`octane:signal-hook-site:1\0${normalizeTextTypeFilename(filename) ?? filename}\0${position}`,
	)}`;
}

// Arguments may start inside parentheses or at a nested callee's replacement
// offset. Replace the call delimiter itself so source edits never overlap.
function callOpenParen(node, source) {
	let pos = node.typeArguments?.end ?? node.callee.end;
	while (pos < node.end) {
		if (
			/\s/.test(source[pos]) ||
			source[pos] === ')' ||
			source[pos] === '?' ||
			source[pos] === '.'
		) {
			pos++;
		} else if (source.startsWith('/*', pos)) {
			pos = source.indexOf('*/', pos + 2) + 2;
		} else if (source.startsWith('//', pos)) {
			while (pos < node.end && source[pos] !== '\n' && source[pos] !== '\r') pos++;
		} else return source[pos] === '(' ? pos : -1;
	}
	return -1;
}

// A hot update keeps each cell and its committed captures but replaces the
// closures, like a hook whose dependency list is reset. A token created by each
// evaluation of the module makes every edited declaration differ once.
const HMR_REVISION = '_$signalRevision';

/**
 * Give owner-facade signal declarations a client/server-stable authored site.
 * Existing explicit Scope methods are deliberately outside this transform.
 */
export function lowerSignalDeclarations(ast, filename, options) {
	const cleanFilename = normalizeTextTypeFilename(filename) ?? filename;
	const lexical = createLexicalAnalysis(ast);
	const owners = lexicalOwners(ast);
	const usedNames = identifierNames(ast);
	const namedImports = new Map();
	const namespaceImports = new Map();
	const importRecords = new Map();

	for (const statement of ast.body ?? []) {
		if (
			statement.type !== 'ImportDeclaration' ||
			statement.importKind === 'type' ||
			!SIGNAL_MODULES.has(statement.source?.value)
		) {
			continue;
		}
		for (const specifier of statement.specifiers ?? []) {
			if (specifier.importKind === 'type') continue;
			if (specifier.type === 'ImportNamespaceSpecifier') {
				namespaceImports.set(specifier.local.name, statement.source.value);
				continue;
			}
			if (specifier.type !== 'ImportSpecifier') continue;
			const imported = specifier.imported?.name ?? specifier.imported?.value;
			if (SIGNAL_FACTORIES.has(imported)) {
				namedImports.set(specifier.local.name, {
					declaration: statement,
					factory: imported,
					source: statement.source.value,
				});
			}
		}
	}

	function helperFor(record, imported) {
		let helpers = importRecords.get(record.declaration);
		if (helpers === undefined) importRecords.set(record.declaration, (helpers = new Map()));
		let local = helpers.get(imported);
		if (local === undefined) {
			local = allocateName(usedNames, `_$${imported}`);
			helpers.set(imported, local);
		}
		return b.id(local);
	}

	// The factory a call declares through a trusted import, and how to name its
	// lowered helpers, or null for any other call.
	function trustedFactory(node) {
		if (node.type !== 'CallExpression' && node.type !== 'OptionalCallExpression') return null;
		const callee = node.callee;
		const scope = lexical.nodeScopes.get(callee) ?? lexical.rootScope;
		if (callee?.type === 'Identifier') {
			const record = namedImports.get(callee.name);
			if (record === undefined) return null;
			const binding = lexical.resolveBinding(scope, callee.name);
			if (binding?.scope !== lexical.rootScope || binding.importSource?.value !== record.source) {
				return null;
			}
			return { helper: (imported) => helperFor(record, imported), factory: record.factory };
		}
		if (
			(callee?.type === 'MemberExpression' || callee?.type === 'OptionalMemberExpression') &&
			callee.object?.type === 'Identifier'
		) {
			const factory = propertyName(callee);
			if (!SIGNAL_FACTORIES.has(factory)) return null;
			const source = namespaceImports.get(callee.object.name);
			const binding = lexical.resolveBinding(scope, callee.object.name);
			if (
				source === undefined ||
				binding?.scope !== lexical.rootScope ||
				binding.importSource?.value !== source
			) {
				return null;
			}
			return {
				helper: (imported) => b.member(b.id(callee.object.name), imported),
				factory,
			};
		}
		return null;
	}

	let changed = false;
	const declarations = [];
	const seen = new WeakSet();
	const collect = (node) => {
		if (node === null || typeof node !== 'object' || seen.has(node)) return;
		seen.add(node);
		if (Array.isArray(node)) {
			for (const child of node) collect(child);
			return;
		}
		const trusted = trustedFactory(node);
		if (trusted !== null) {
			changed = true;
			// Module declarations are never declared again by a later render.
			if ((owners.get(node)?.length ?? 1) > 1)
				declarations.push({ node, factory: trusted.factory });
		}
		for (const key in node) {
			if (!AST_METADATA.has(key) && !key.startsWith('_octane')) collect(node[key]);
		}
	};
	collect(ast);
	if (!changed) return ast;
	const captures = analyzeSignalCaptures(ast, declarations);
	const revision =
		options?.hmr && captures.size > 0 ? b.id(allocateName(usedNames, HMR_REVISION)) : null;

	let lowered = mapAst(ast, (node) => {
		const trusted = trustedFactory(node);
		if (trusted === null) return null;
		const site = signalSite(cleanFilename, owners.get(node) ?? ['module'], node);
		const args = [inheritHookMemoOrigin(b.literal(site, JSON.stringify(site)), node)];
		args.push(...(node.arguments ?? []));
		const listed = captures.get(node);
		if (listed !== undefined) {
			// The site shifts each authored argument by one.
			while (args.length <= CAPTURE_INDEX.get(trusted.factory))
				args.push(inheritHookMemoOrigin(b.void0, node));
			const methodHelper = () => trusted.helper(METHOD_DEP);
			const elements = listed.map((dependency) => captureExpression(dependency, methodHelper));
			if (revision !== null) elements.push({ ...revision });
			args.push(inheritHookMemoOrigin(b.array(elements), node));
		}
		return {
			...node,
			...(pureSignalDeclaration(trusted.factory, node) ? { __octanePure: true } : null),
			callee: inheritHookMemoOrigin(
				trusted.helper(declarationHelper(trusted.factory, node)),
				node.callee,
			),
			arguments: args,
		};
	});

	const body = lowered.body.map((statement) => {
		const helpers = importRecords.get(statement);
		if (helpers === undefined || helpers.size === 0) return statement;
		const generated = [...helpers].map(([imported, local]) =>
			inheritHookMemoOrigin(b.import_specifier(imported, local), statement),
		);
		return { ...statement, specifiers: [...statement.specifiers, ...generated] };
	});
	if (revision !== null) {
		// Before any statement that could render, so no declaration reads it early.
		const first = body.findIndex((statement) => statement.type !== 'ImportDeclaration');
		const at = first === -1 ? body.length : first;
		body.splice(
			at,
			0,
			inheritHookMemoOrigin(b.const({ ...revision }, b.object([])), body[at] ?? body[at - 1]),
		);
	}
	return { ...lowered, _octaneSignalDeclarations: true, body };
}

/**
 * Plain `.ts`/`.js` helpers use the compiler's surgical source pass rather than
 * the full TSRX printer. Return byte-offset edits and collision-safe imports so
 * that pass can share the exact declaration identity contract without a second
 * parse/print cycle.
 */
export function signalDeclarationSourceEdits(ast, filename, source, options) {
	const cleanFilename = normalizeTextTypeFilename(filename) ?? filename;
	const lexical = createLexicalAnalysis(ast);
	const owners = lexicalOwners(ast);
	const usedNames = identifierNames(ast);
	const namedImports = new Map();
	const namespaceImports = new Map();
	const helpers = new Map();

	for (const statement of ast.body ?? []) {
		if (
			statement.type !== 'ImportDeclaration' ||
			statement.importKind === 'type' ||
			!SIGNAL_MODULES.has(statement.source?.value)
		) {
			continue;
		}
		for (const specifier of statement.specifiers ?? []) {
			if (specifier.importKind === 'type') continue;
			if (specifier.type === 'ImportNamespaceSpecifier') {
				namespaceImports.set(specifier.local.name, statement.source.value);
				continue;
			}
			if (specifier.type !== 'ImportSpecifier') continue;
			const imported = specifier.imported?.name ?? specifier.imported?.value;
			if (SIGNAL_FACTORIES.has(imported)) {
				namedImports.set(specifier.local.name, {
					factory: imported,
					source: statement.source.value,
				});
			}
		}
	}

	const helperFor = (record, imported) => {
		const key = `${record.source}\0${imported}`;
		let helper = helpers.get(key);
		if (helper === undefined) {
			helper = {
				imported,
				local: allocateName(usedNames, `_$${imported}`),
				source: record.source,
			};
			helpers.set(key, helper);
		}
		return helper.local;
	};
	const edits = [];
	const declarations = [];
	const seen = new WeakSet();
	const visit = (node) => {
		if (node === null || typeof node !== 'object' || seen.has(node)) return;
		seen.add(node);
		if (Array.isArray(node)) {
			for (const child of node) visit(child);
			return;
		}
		if (node.type === 'CallExpression' || node.type === 'OptionalCallExpression') {
			const callee = node.callee;
			const scope = lexical.nodeScopes.get(callee) ?? lexical.rootScope;
			let replacement = null;
			let factory = null;
			let helper = null;
			if (callee?.type === 'Identifier') {
				const record = namedImports.get(callee.name);
				const binding = lexical.resolveBinding(scope, callee.name);
				if (
					record !== undefined &&
					binding?.scope === lexical.rootScope &&
					binding.importSource?.value === record.source
				) {
					factory = record.factory;
					helper = (imported) => helperFor(record, imported);
				}
			} else if (
				(callee?.type === 'MemberExpression' || callee?.type === 'OptionalMemberExpression') &&
				callee.object?.type === 'Identifier'
			) {
				const member = propertyName(callee);
				const importSource = namespaceImports.get(callee.object.name);
				const binding = lexical.resolveBinding(scope, callee.object.name);
				if (
					SIGNAL_FACTORIES.has(member) &&
					importSource !== undefined &&
					binding?.scope === lexical.rootScope &&
					binding.importSource?.value === importSource
				) {
					factory = member;
					helper = (imported) => `${callee.object.name}.${imported}`;
				}
			}
			if (factory !== null) replacement = helper(declarationHelper(factory, node));
			if (replacement !== null) {
				const opening = callOpenParen(node, source);
				if (opening === -1) return;
				const pure = pureSignalDeclaration(factory, node);
				if ((owners.get(node)?.length ?? 1) > 1) declarations.push({ node, factory, helper });
				edits.push({
					pos: callee.start,
					end: callee.end,
					text: `${pure ? '/* @__PURE__ */ ' : ''}${replacement}`,
				});
				const first = node.arguments?.[0];
				const site = signalSite(cleanFilename, owners.get(node) ?? ['module'], node);
				edits.push({
					pos: opening,
					end: opening + 1,
					text: `(${JSON.stringify(site)}${first === undefined ? '' : ', '}`,
				});
			}
		}
		for (const key in node) {
			if (!AST_METADATA.has(key) && !key.startsWith('_octane')) visit(node[key]);
		}
	};
	visit(ast);
	const captures = analyzeSignalCaptures(ast, declarations);
	const revision = options?.hmr && captures.size > 0 ? allocateName(usedNames, HMR_REVISION) : null;
	for (const { node, factory, helper } of declarations) {
		const listed = captures.get(node);
		if (listed === undefined) continue;
		const missing = CAPTURE_INDEX.get(factory) - node.arguments.length;
		const methodHelper = () => helper(METHOD_DEP);
		const elements = listed.map((dependency) => captureSource(dependency, source, methodHelper));
		if (revision !== null) elements.push(revision);
		edits.push({
			pos: node.end - 1,
			text: `${captureSeparator(node, source)}${'void 0, '.repeat(missing)}[${elements.join(', ')}]`,
		});
	}
	return {
		edits,
		imports: [...helpers.values()],
		// Declared with the imports, ahead of any authored statement.
		prelude: revision === null ? '' : `var ${revision} = {};`,
		usedNames,
		usesSignals: edits.length > 0,
	};
}
