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
	if (replacement !== null) return replacement;
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

	function helperFor(record) {
		let helpers = importRecords.get(record.declaration);
		if (helpers === undefined) importRecords.set(record.declaration, (helpers = new Map()));
		let local = helpers.get(record.factory);
		if (local === undefined) {
			const imported = SIGNAL_FACTORIES.get(record.factory);
			local = allocateName(usedNames, `_$${imported}`);
			helpers.set(record.factory, local);
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
			return { callee: helperFor(record), factory: record.factory };
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
				callee: b.member(b.id(callee.object.name), SIGNAL_FACTORIES.get(factory)),
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
			const generated = [...helpers].map(([factory, local]) =>
				inheritHookMemoOrigin(b.import_specifier(SIGNAL_FACTORIES.get(factory), local), statement),
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

	const helperFor = (record) => {
		const key = `${record.source}\0${record.factory}`;
		let helper = helpers.get(key);
		if (helper === undefined) {
			helper = {
				imported: SIGNAL_FACTORIES.get(record.factory),
				local: allocateName(usedNames, `_$${SIGNAL_FACTORIES.get(record.factory)}`),
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
			if (callee?.type === 'Identifier') {
				const record = namedImports.get(callee.name);
				const binding = lexical.resolveBinding(scope, callee.name);
				if (
					record !== undefined &&
					binding?.scope === lexical.rootScope &&
					binding.importSource?.value === record.source
				) {
					replacement = helperFor(record);
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
					replacement = `${callee.object.name}.${SIGNAL_FACTORIES.get(factory)}`;
				}
			}
			if (replacement !== null) {
				edits.push({ pos: callee.start, end: callee.end, text: replacement });
				const first = node.arguments?.[0];
				const argumentPosition = first?.start ?? Math.max(callee.end, node.end - 1);
				const site = signalSite(cleanFilename, owners.get(node) ?? ['module'], node);
				edits.push({
					pos: argumentPosition,
					text: `${JSON.stringify(site)}${first === undefined ? '' : ', '}`,
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
