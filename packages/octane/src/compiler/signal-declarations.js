import { builders as b, strongHash } from '@tsrx/core';
import { createLexicalAnalysis } from './compile-universal.js';
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
	const offset = args[0]?.type === 'Literal' && typeof args[0].value === 'string' ? 1 : 0;
	const compute = unwrapExpression(args[offset]);
	if (
		(compute?.type !== 'ArrowFunctionExpression' && compute?.type !== 'FunctionExpression') ||
		compute.params.length !== 0
	)
		return '__derivedAt';
	const options = unwrapExpression(args[offset + 1]);
	if (options !== undefined) {
		// A literal assertion is immutable for this declaration; unknown options
		// may have a changing sync flag or an observable accessor. Keep them general.
		const property =
			options?.type === 'ObjectExpression' && options.properties.length === 1
				? options.properties[0]
				: undefined;
		return property?.type === 'Property' &&
			property.kind === 'init' &&
			!property.computed &&
			(property.key?.name ?? property.key?.value) === 'sync' &&
			property.value?.type === 'Literal' &&
			property.value.value === true
			? '__derivedScalarAt'
			: '__derivedAt';
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

// Declarations create lazy descriptors, not live cells. Only omit construction
// when its validation and eager option reads are provably unobservable; a PURE
// call still evaluates any effectful arguments. Unknown callbacks, observable
// option reads, and malformed overloads must keep their effects and diagnostics.
function pureSignalDeclaration(factory, call) {
	const args = call.arguments ?? [];
	if (args.some((argument) => argument.type === 'SpreadElement')) return false;
	let offset = 0;
	const first = unwrapExpression(args[0]);
	if (first?.type === 'Literal' && typeof first.value === 'string') {
		if (factory === 'signal$' && args.length === 1) return true;
		// Empty keys do not select the callback overload at runtime.
		if (!first.value.trim()) return false;
		offset = 1;
	}
	if (factory === 'signal$') return args.length === 1 || (offset === 1 && args.length === 2);
	const functionAt = (index) => {
		const value = unwrapExpression(args[index]);
		return value?.type === 'ArrowFunctionExpression' || value?.type === 'FunctionExpression';
	};
	if (factory === 'derived$') {
		return functionAt(offset) && args.length >= offset + 1 && args.length <= offset + 2;
	}
	if (
		factory !== 'query$' ||
		!functionAt(offset) ||
		!functionAt(offset + 1) ||
		args.length < offset + 2 ||
		args.length > offset + 3
	) {
		return false;
	}
	const options = unwrapExpression(args[offset + 2]);
	if (options === undefined || (options.type === 'Literal' && options.value === null)) return true;
	// query$ reads options.kind while constructing the descriptor. A literal
	// supported kind is safe; a getter, spread, or opaque options object is not.
	if (options.type !== 'ObjectExpression' || options.properties.length !== 1) return false;
	const property = options.properties[0];
	return (
		property.type === 'Property' &&
		property.kind === 'init' &&
		!property.computed &&
		(property.key?.name ?? property.key?.value) === 'kind' &&
		property.value?.type === 'Literal' &&
		(property.value.value === 'promise' || property.value.value === 'stream')
	);
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

/**
 * Give owner-facade signal declarations a client/server-stable authored site.
 * Existing explicit Scope methods are deliberately outside this transform.
 */
export function lowerSignalDeclarations(ast, filename) {
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

	function helperFor(record, call) {
		let helpers = importRecords.get(record.declaration);
		if (helpers === undefined) importRecords.set(record.declaration, (helpers = new Map()));
		const imported = declarationHelper(record.factory, call);
		let local = helpers.get(imported);
		if (local === undefined) {
			local = allocateName(usedNames, `_$${imported}`);
			helpers.set(imported, local);
		}
		return b.id(local);
	}

	function trustedFactory(node) {
		const callee = node.callee;
		const scope = lexical.nodeScopes.get(callee) ?? lexical.rootScope;
		if (callee?.type === 'Identifier') {
			const record = namedImports.get(callee.name);
			if (record === undefined) return null;
			const binding = lexical.resolveBinding(scope, callee.name);
			if (binding?.scope !== lexical.rootScope || binding.importSource?.value !== record.source) {
				return null;
			}
			return { callee: helperFor(record, node), factory: record.factory };
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
				callee: b.member(b.id(callee.object.name), declarationHelper(factory, node)),
				factory,
			};
		}
		return null;
	}

	let changed = false;
	let lowered = mapAst(ast, (node) => {
		if (node.type !== 'CallExpression' && node.type !== 'OptionalCallExpression') return null;
		const trusted = trustedFactory(node);
		if (trusted === null) return null;
		changed = true;
		const site = signalSite(cleanFilename, owners.get(node) ?? ['module'], node);
		return {
			...node,
			...(pureSignalDeclaration(trusted.factory, node) ? { __octanePure: true } : null),
			callee: inheritHookMemoOrigin(trusted.callee, node.callee),
			arguments: [
				inheritHookMemoOrigin(b.literal(site, JSON.stringify(site)), node),
				...(node.arguments ?? []),
			],
		};
	});

	if (!changed) return ast;
	lowered = {
		...lowered,
		_octaneSignalDeclarations: true,
		body: lowered.body.map((statement) => {
			const helpers = importRecords.get(statement);
			if (helpers === undefined || helpers.size === 0) return statement;
			const generated = [...helpers].map(([imported, local]) =>
				inheritHookMemoOrigin(b.import_specifier(imported, local), statement),
			);
			return { ...statement, specifiers: [...statement.specifiers, ...generated] };
		}),
	};
	return lowered;
}

/**
 * Plain `.ts`/`.js` helpers use the compiler's surgical source pass rather than
 * the full TSRX printer. Return byte-offset edits and collision-safe imports so
 * that pass can share the exact declaration identity contract without a second
 * parse/print cycle.
 */
export function signalDeclarationSourceEdits(ast, filename, source) {
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

	const helperFor = (record, call) => {
		const imported = declarationHelper(record.factory, call);
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
			let pure = false;
			if (callee?.type === 'Identifier') {
				const record = namedImports.get(callee.name);
				const binding = lexical.resolveBinding(scope, callee.name);
				if (
					record !== undefined &&
					binding?.scope === lexical.rootScope &&
					binding.importSource?.value === record.source
				) {
					replacement = helperFor(record, node);
					pure = pureSignalDeclaration(record.factory, node);
				}
			} else if (
				(callee?.type === 'MemberExpression' || callee?.type === 'OptionalMemberExpression') &&
				callee.object?.type === 'Identifier'
			) {
				const factory = propertyName(callee);
				const importSource = namespaceImports.get(callee.object.name);
				const binding = lexical.resolveBinding(scope, callee.object.name);
				if (
					SIGNAL_FACTORIES.has(factory) &&
					importSource !== undefined &&
					binding?.scope === lexical.rootScope &&
					binding.importSource?.value === importSource
				) {
					replacement = `${callee.object.name}.${declarationHelper(factory, node)}`;
					pure = pureSignalDeclaration(factory, node);
				}
			}
			if (replacement !== null) {
				const opening = callOpenParen(node, source);
				if (opening === -1) return;
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
	return {
		edits,
		imports: [...helpers.values()],
		usedNames,
		usesSignals: edits.length > 0,
	};
}
