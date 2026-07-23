/**
 * Server-graph support for renderer modules that explicitly opt into
 * `server: "client-only"`.
 *
 * The authored module must never execute in the server graph. We therefore
 * derive its public ESM names from syntax and emit inert, export-preserving
 * sentinels. Importers are checked separately after renderer-owned child
 * regions have been omitted, so any remaining reference receives a source
 * diagnostic before a sentinel can affect server behavior.
 */
import { builders as b, parseModule } from '@tsrx/core';
import { print as esrapPrint } from 'esrap';
import esrapTsx from 'esrap/languages/tsx';

const CLIENT_REFERENCE_VERSION = 1;
export const CLIENT_REFERENCE_MANIFEST_FILENAME = 'octane-client-references.json';
export const CLIENT_REFERENCE_MANIFEST_VERSION = 1;
const TRANSPARENT_TS_EXPRESSIONS = new Set([
	'TSAsExpression',
	'TSInstantiationExpression',
	'TSNonNullExpression',
	'TSSatisfiesExpression',
	'TSTypeAssertion',
]);

function astName(node) {
	if (node?.type === 'Identifier' || node?.type === 'JSXIdentifier') return node.name;
	return typeof node?.value === 'string' ? node.value : null;
}

function addPatternNames(pattern, output) {
	if (!pattern) return;
	if (pattern.type === 'TSParameterProperty') {
		addPatternNames(pattern.parameter, output);
		return;
	}
	if (pattern.type === 'Identifier') {
		output.add(pattern.name);
		return;
	}
	if (pattern.type === 'RestElement') {
		addPatternNames(pattern.argument, output);
		return;
	}
	if (pattern.type === 'AssignmentPattern') {
		addPatternNames(pattern.left, output);
		return;
	}
	if (pattern.type === 'ArrayPattern') {
		for (const element of pattern.elements ?? []) addPatternNames(element, output);
		return;
	}
	if (pattern.type === 'ObjectPattern') {
		for (const property of pattern.properties ?? []) {
			addPatternNames(property.argument ?? property.value, output);
		}
	}
}

function diagnosticError(code, filename, node, message) {
	const start = node?.loc?.start;
	const at = start ? `${filename}:${start.line}:${start.column}` : filename;
	const error = new Error(`${message} (${at})`);
	error.code = code;
	error.filename = filename;
	error.loc = start ? Object.freeze({ line: start.line, column: start.column }) : null;
	return error;
}

function staticRuntimeRequest(statement) {
	const source = statement?.source?.value;
	if (typeof source === 'string') return source;
	if (
		statement?.type === 'TSImportEqualsDeclaration' &&
		statement.importKind !== 'type' &&
		statement.moduleReference?.type === 'TSExternalModuleReference'
	) {
		const request = statement.moduleReference.expression?.value;
		return typeof request === 'string' ? request : null;
	}
	return null;
}

/** Stable metadata shared by neutral, Vite, Rspack, and Rsbuild transforms. */
export function createClientReference(renderer, moduleId) {
	return Object.freeze({
		id: `octane-client-reference-v${CLIENT_REFERENCE_VERSION}:${renderer}:${moduleId}`,
		moduleId,
		renderer,
	});
}

/**
 * Canonical client-reference manifest shared by every bundler adapter.
 * Adapters only discover which concrete JavaScript chunks contain a transformed
 * module; identity validation, conflict detection, merging, and deterministic
 * serialization shape remain bundler-neutral here.
 */
export function createClientReferenceManifest(entries) {
	const references = new Map();
	for (const entry of entries ?? []) {
		const reference = entry?.reference;
		if (
			reference === null ||
			typeof reference !== 'object' ||
			typeof reference.id !== 'string' ||
			typeof reference.moduleId !== 'string' ||
			typeof reference.renderer !== 'string'
		) {
			throw new TypeError(
				'Invalid Octane client-reference metadata supplied by a bundler adapter.',
			);
		}
		const chunks = [...new Set(entry.chunks ?? [])]
			.filter((chunk) => typeof chunk === 'string' && chunk.length > 0)
			.sort();
		// A module eliminated from the emitted client graph has no loadable
		// reference. Concatenated modules are associated with their outer chunk by
		// the adapter before reaching this neutral normalization boundary.
		if (chunks.length === 0) continue;
		const previous = references.get(reference.id);
		if (
			previous !== undefined &&
			(previous.moduleId !== reference.moduleId || previous.renderer !== reference.renderer)
		) {
			throw new Error(
				`Conflicting Octane client-reference metadata for ${JSON.stringify(reference.id)}.`,
			);
		}
		const normalized = previous ?? {
			moduleId: reference.moduleId,
			renderer: reference.renderer,
			chunks: new Set(),
		};
		for (const chunk of chunks) normalized.chunks.add(chunk);
		references.set(reference.id, normalized);
	}

	const output = {};
	for (const id of [...references.keys()].sort()) {
		const entry = references.get(id);
		output[id] = {
			moduleId: entry.moduleId,
			renderer: entry.renderer,
			chunks: [...entry.chunks].sort(),
		};
	}
	return { version: CLIENT_REFERENCE_MANIFEST_VERSION, references: output };
}

/** Return the runtime import/re-export requests that a bundler should resolve. */
export function findStaticRuntimeImportRequests(source, filename = 'unknown') {
	let ast;
	try {
		ast = parseModule(source, filename);
	} catch {
		// The owning compiler/parser will report the useful syntax diagnostic. Import
		// classification is an adapter prepass and must not replace it.
		return [];
	}
	const requests = new Set();
	for (const statement of ast.body ?? []) {
		if (statement.type === 'TSImportEqualsDeclaration') {
			const request = staticRuntimeRequest(statement);
			if (request !== null) requests.add(request);
			continue;
		}
		if (
			statement.type !== 'ImportDeclaration' &&
			statement.type !== 'ExportNamedDeclaration' &&
			statement.type !== 'ExportAllDeclaration'
		) {
			continue;
		}
		if (statement.importKind === 'type' || statement.exportKind === 'type') continue;
		const request = staticRuntimeRequest(statement);
		if (request !== null) requests.add(request);
	}
	return [...requests];
}

function collectRuntimeExports(ast, filename) {
	const exports = new Map();
	const addExport = (name, origin) => {
		if (!exports.has(name)) exports.set(name, origin);
	};
	for (const statement of ast.body ?? []) {
		if (statement.type === 'ExportDefaultDeclaration') {
			if (
				statement.exportKind !== 'type' &&
				statement.declaration?.declare !== true &&
				statement.declaration?.type !== 'TSInterfaceDeclaration'
			) {
				addExport('default', statement);
			}
			continue;
		}
		if (statement.type === 'TSExportAssignment') {
			throw diagnosticError(
				'OCTANE_CLIENT_ONLY_EXPORT_ASSIGNMENT_UNSUPPORTED',
				filename,
				statement,
				'Client-only server stubs cannot preserve TypeScript `export =` module shape. Use ESM default or named exports',
			);
		}
		if (
			statement.type === 'TSImportEqualsDeclaration' &&
			statement.isExport === true &&
			statement.importKind !== 'type' &&
			statement.id?.name
		) {
			addExport(statement.id.name, statement.id);
			continue;
		}
		if (statement.type === 'ExportAllDeclaration') {
			if (statement.exportKind === 'type') continue;
			const exported = astName(statement.exported);
			if (exported !== null) {
				addExport(exported, statement.exported ?? statement);
				continue;
			}
			throw diagnosticError(
				'OCTANE_CLIENT_ONLY_EXPORT_STAR_UNSUPPORTED',
				filename,
				statement,
				'Client-only server stubs cannot preserve an `export *` without evaluating another authored module. Replace it with explicit named re-exports',
			);
		}
		if (statement.type !== 'ExportNamedDeclaration' || statement.exportKind === 'type') continue;

		const declaration = statement.declaration;
		if (declaration?.declare === true) continue;
		if (declaration?.type === 'VariableDeclaration') {
			for (const item of declaration.declarations ?? []) {
				const names = new Set();
				addPatternNames(item.id, names);
				for (const name of names) addExport(name, item.id);
			}
		} else if (
			declaration?.id &&
			(declaration.type === 'FunctionDeclaration' ||
				declaration.type === 'ClassDeclaration' ||
				declaration.type === 'TSEnumDeclaration' ||
				declaration.type === 'TSModuleDeclaration')
		) {
			addExport(declaration.id.name, declaration.id);
		}
		for (const specifier of statement.specifiers ?? []) {
			if (specifier.exportKind === 'type') continue;
			const exported = astName(specifier.exported);
			if (exported !== null) addExport(exported, specifier.exported ?? specifier);
		}
	}
	return [...exports]
		.map(([name, origin]) => ({ name, origin }))
		.sort((left, right) => (left.name < right.name ? -1 : left.name > right.name ? 1 : 0));
}

/**
 * Generated stub scaffolding has no authored syntax of its own, but every
 * printed node still inherits a source origin so the auxiliary module carries
 * a useful esrap map. The tree is compiler-owned; parsed nodes are never
 * embedded or mutated.
 */
function inheritGeneratedOrigin(root, origin) {
	const seen = new WeakSet();
	const visit = (value) => {
		if (!value || typeof value !== 'object' || seen.has(value)) return;
		seen.add(value);
		if (Array.isArray(value)) {
			for (const item of value) visit(item);
			return;
		}
		if (typeof value.type === 'string' && value.loc == null && origin?.loc != null) {
			value.start = origin.start;
			value.end = origin.end;
			value.loc = origin.loc;
		}
		for (const [key, child] of Object.entries(value)) {
			if (key !== 'loc' && key !== 'metadata') visit(child);
		}
	};
	visit(root);
	return root;
}

const jsonStringifyCall = (expression) => b.call(b.member(b.id('JSON'), 'stringify'), expression);

function clientOnlyStubVisitors() {
	const visitors = esrapTsx();
	const printExportSpecifier = visitors.ExportSpecifier;
	return {
		...visitors,
		ExportSpecifier(node, context) {
			// ESTree represents quoted export names as Literals. esrap 2.3's TS
			// visitor currently prints only Identifier→Identifier aliases; retain
			// the standard AST and teach this one print the missing literal arm.
			if (node.exported.type === 'Literal') {
				context.visit(node.local);
				context.write(' as ');
				context.visit(node.exported);
				return;
			}
			printExportSpecifier(node, context);
		},
	};
}

/**
 * Emit an ESM module with the same explicit runtime export names but none of
 * the authored imports, declarations, or top-level setup.
 */
export function createClientOnlyServerStub(source, filename, renderer) {
	const ast = parseModule(source, filename);
	const exportEntries = collectRuntimeExports(ast, filename);
	const exports = exportEntries.map((entry) => entry.name);
	const message = b.template(
		[
			b.quasi('Client-only export '),
			b.quasi(' from '),
			b.quasi(' (renderer '),
			b.quasi(') was used by the server graph.', true),
		],
		[
			jsonStringifyCall(b.id('name')),
			jsonStringifyCall(b.id('__octaneClientOnlyModule')),
			jsonStringifyCall(b.id('__octaneClientOnlyRenderer')),
		],
	);
	const fail = b.arrow(
		[],
		b.block([
			b.const('error', b.new('Error', undefined, message)),
			b.stmt(
				b.assignment(
					'=',
					b.member(b.id('error'), 'code'),
					b.literal('OCTANE_CLIENT_ONLY_SERVER_USE'),
				),
			),
			b.stmt(
				b.assignment('=', b.member(b.id('error'), 'filename'), b.id('__octaneClientOnlyModule')),
			),
			{ type: 'ThrowStatement', argument: b.id('error'), metadata: { path: [] } },
		]),
	);
	const traps = [
		'apply',
		'construct',
		'defineProperty',
		'deleteProperty',
		'get',
		'getOwnPropertyDescriptor',
		'getPrototypeOf',
		'has',
		'isExtensible',
		'ownKeys',
		'preventExtensions',
		'set',
		'setPrototypeOf',
	];
	const body = [
		b.const('__octaneClientOnlyModule', b.literal(filename)),
		b.const('__octaneClientOnlyRenderer', b.literal(renderer)),
		b.function_declaration(
			b.id('__octaneClientOnlyExport'),
			[b.id('name')],
			b.block([
				b.const('fail', fail),
				b.return(
					b.new(
						'Proxy',
						undefined,
						b.id('fail'),
						b.object(traps.map((name) => b.init(name, b.id('fail')))),
					),
				),
			]),
		),
	];
	for (let index = 0; index < exportEntries.length; index++) {
		body.push(
			inheritGeneratedOrigin(
				b.const(
					`__octaneClientOnlyExport${index}`,
					b.call('__octaneClientOnlyExport', b.literal(exportEntries[index].name)),
				),
				exportEntries[index].origin,
			),
		);
	}
	const exportSpecifiers = exportEntries.map((entry, index) =>
		inheritGeneratedOrigin(
			b.export_specifier(
				`__octaneClientOnlyExport${index}`,
				/^[$A-Z_a-z][$\w]*$/u.test(entry.name) ? b.id(entry.name) : b.literal(entry.name),
			),
			entry.origin,
		),
	);
	body.push(b.export(null, exportSpecifiers));
	const program = inheritGeneratedOrigin(
		{
			type: 'Program',
			sourceType: 'module',
			body,
			metadata: { path: [] },
		},
		ast,
	);
	const printed = esrapPrint(program, clientOnlyStubVisitors(), {
		sourceMapSource: filename,
		sourceMapContent: source,
	});
	return Object.freeze({
		ast: program,
		code: printed.code,
		map: printed.map,
		exports: Object.freeze(exports),
	});
}

function bindingNames(pattern) {
	const output = new Set();
	addPatternNames(pattern, output);
	return output;
}

function directDeclaration(statement) {
	if (
		statement?.type === 'ExportNamedDeclaration' ||
		statement?.type === 'ExportDefaultDeclaration'
	) {
		return statement.declaration;
	}
	return statement;
}

function addDirectScopeBindings(statements, output) {
	for (const statement of statements ?? []) {
		const declaration = directDeclaration(statement);
		if (declaration?.type === 'VariableDeclaration' && declaration.kind !== 'var') {
			for (const item of declaration.declarations ?? []) {
				for (const name of bindingNames(item.id)) output.add(name);
			}
		} else if (
			declaration?.id &&
			(declaration.type === 'FunctionDeclaration' || declaration.type === 'ClassDeclaration')
		) {
			output.add(declaration.id.name);
		}
	}
}

function addFunctionVarBindings(node, output, root = true) {
	if (!node || typeof node !== 'object') return;
	if (Array.isArray(node)) {
		for (const child of node) addFunctionVarBindings(child, output, root);
		return;
	}
	if (
		!root &&
		(node.type === 'FunctionDeclaration' ||
			node.type === 'FunctionExpression' ||
			node.type === 'ArrowFunctionExpression' ||
			node.type === 'ClassDeclaration' ||
			node.type === 'ClassExpression' ||
			node.type === 'StaticBlock' ||
			node.type === 'TSModuleDeclaration')
	) {
		return;
	}
	if (node.type === 'VariableDeclaration' && node.kind === 'var') {
		for (const item of node.declarations ?? []) {
			for (const name of bindingNames(item.id)) output.add(name);
		}
	}
	for (const [key, child] of Object.entries(node)) {
		if (key === 'loc' || key === 'start' || key === 'end' || key === 'metadata') continue;
		addFunctionVarBindings(child, output, false);
	}
}

function importedName(specifier) {
	if (specifier.type === 'ImportDefaultSpecifier') return 'default';
	if (specifier.type === 'ImportNamespaceSpecifier') return '*';
	return astName(specifier.imported) ?? 'unknown';
}

/**
 * Reject references to client-only imports that survived the server omission
 * rewrite. Side-effect imports and unused bindings are safe because their
 * target compiles to a no-op stub.
 */
export function assertNoLiveClientOnlyImports(
	source,
	filename,
	clientOnlyImports = [],
	parsedAst = null,
) {
	if (!Array.isArray(clientOnlyImports) || clientOnlyImports.length === 0) return;
	const byRequest = new Map(clientOnlyImports.map((entry) => [entry.request, entry]));
	const ast = parsedAst ?? parseModule(source, filename);
	const imported = new Map();

	for (const statement of ast.body ?? []) {
		const request = staticRuntimeRequest(statement);
		const classified = typeof request === 'string' ? byRequest.get(request) : undefined;
		if (!classified || statement.importKind === 'type' || statement.exportKind === 'type') continue;
		if (statement.type === 'TSImportEqualsDeclaration') {
			if (statement.isExport === true) {
				throw clientOnlyUseError(filename, statement.id ?? statement, classified, '*');
			}
			if (statement.id?.name) {
				imported.set(statement.id.name, { classified, imported: '*' });
			}
			continue;
		}
		if (statement.type === 'ImportDeclaration') {
			for (const specifier of statement.specifiers ?? []) {
				if (specifier.importKind === 'type' || !specifier.local?.name) continue;
				imported.set(specifier.local.name, {
					classified,
					imported: importedName(specifier),
				});
			}
			continue;
		}
		if (statement.type === 'ExportNamedDeclaration' && statement.source) {
			const runtimeSpecifier = (statement.specifiers ?? []).find(
				(specifier) => specifier.exportKind !== 'type',
			);
			if (runtimeSpecifier) {
				throw clientOnlyUseError(
					filename,
					runtimeSpecifier,
					classified,
					astName(runtimeSpecifier.local) ?? '*',
				);
			}
			continue;
		}
		if (statement.type === 'ExportAllDeclaration') {
			throw clientOnlyUseError(filename, statement, classified, '*');
		}
	}
	if (imported.size === 0) return;

	const scopes = [];
	const isShadowed = (name) => {
		for (let index = scopes.length - 1; index >= 0; index--) {
			if (scopes[index].has(name)) return true;
		}
		return false;
	};
	const visit = (node, parent = null, key = null) => {
		if (!node || typeof node !== 'object') return;
		if (Array.isArray(node)) {
			for (const child of node) visit(child, parent, key);
			return;
		}
		if (TRANSPARENT_TS_EXPRESSIONS.has(node.type)) {
			visit(node.expression, node, 'expression');
			return;
		}
		// Most TS-prefixed nodes are erased type syntax, but these declarations
		// emit JavaScript or contain runtime initializers. Walk only their runtime
		// fields so type references remain ignored without allowing an enum,
		// namespace, export assignment, import-equals, or parameter default to
		// smuggle a client-only binding into the server graph.
		if (node.type === 'TSEnumDeclaration') {
			if (node.declare !== true) {
				for (const member of node.members ?? []) visit(member.initializer, member, 'initializer');
			}
			return;
		}
		if (node.type === 'TSModuleDeclaration') {
			if (node.declare !== true) visit(node.body, node, 'body');
			return;
		}
		if (node.type === 'TSModuleBlock') {
			const bindings = new Set();
			addDirectScopeBindings(node.body, bindings);
			addFunctionVarBindings(node, bindings);
			scopes.push(bindings);
			visit(node.body, node, 'body');
			scopes.pop();
			return;
		}
		if (node.type === 'TSExportAssignment') {
			visit(node.expression, node, 'expression');
			return;
		}
		if (node.type === 'TSImportEqualsDeclaration') {
			if (node.importKind !== 'type') visitTsQualifiedRuntimeName(node.moduleReference);
			return;
		}
		if (node.type === 'TSParameterProperty') {
			visitPatternDefaults(node.parameter);
			return;
		}
		if (node.type?.startsWith('TS')) return;
		if (node.type === 'ImportDeclaration') return;
		if (node.type === 'ClassExpression' && node.id?.name) {
			// A named class expression owns a lexical binding visible from its
			// heritage and body. Do not mistake self-references for uses of an
			// imported client-only binding with the same name.
			scopes.push(new Set([node.id.name]));
			for (const [childKey, child] of Object.entries(node)) {
				if (childKey === 'id' || childKey === 'loc' || childKey === 'start' || childKey === 'end') {
					continue;
				}
				if (childKey === 'metadata' || childKey === 'parent') continue;
				visit(child, node, childKey);
			}
			scopes.pop();
			return;
		}

		if (
			node.type === 'FunctionDeclaration' ||
			node.type === 'FunctionExpression' ||
			node.type === 'ArrowFunctionExpression'
		) {
			const parameterBindings = new Set();
			if (node.id) for (const name of bindingNames(node.id)) parameterBindings.add(name);
			for (const parameter of node.params ?? []) {
				for (const name of bindingNames(parameter)) parameterBindings.add(name);
			}
			// A non-simple parameter list executes in its own environment. Body `var`
			// declarations do not shadow imports referenced by defaults.
			scopes.push(parameterBindings);
			for (const parameter of node.params ?? []) visitPatternDefaults(parameter);
			scopes.pop();
			const bodyBindings = new Set(parameterBindings);
			addFunctionVarBindings(node.body, bodyBindings);
			scopes.push(bodyBindings);
			visit(node.body, node, 'body');
			scopes.pop();
			return;
		}
		if (node.type === 'BlockStatement' || node.type === 'JSXCodeBlock') {
			const bindings = new Set();
			addDirectScopeBindings(node.body, bindings);
			scopes.push(bindings);
			visit(node.body, node, 'body');
			if (node.render) visit(node.render, node, 'render');
			scopes.pop();
			return;
		}
		if (node.type === 'CatchClause') {
			const bindings = bindingNames(node.param);
			scopes.push(bindings);
			visit(node.body, node, 'body');
			scopes.pop();
			return;
		}
		if (
			node.type === 'ForStatement' ||
			node.type === 'ForInStatement' ||
			node.type === 'ForOfStatement'
		) {
			const declaration = node.type === 'ForStatement' ? node.init : node.left;
			const bindings = new Set();
			if (declaration?.type === 'VariableDeclaration') {
				for (const item of declaration.declarations ?? []) {
					for (const name of bindingNames(item.id)) bindings.add(name);
				}
			}
			scopes.push(bindings);
			visit(declaration, node, node.type === 'ForStatement' ? 'init' : 'left');
			visit(node.test, node, 'test');
			visit(node.update, node, 'update');
			visit(node.right, node, 'right');
			visit(node.body, node, 'body');
			scopes.pop();
			return;
		}

		if (
			(node.type === 'Identifier' || node.type === 'JSXIdentifier') &&
			imported.has(node.name) &&
			!isShadowed(node.name) &&
			isReferenceIdentifier(node, parent, key)
		) {
			const entry = imported.get(node.name);
			throw clientOnlyUseError(filename, node, entry.classified, entry.imported);
		}

		for (const [childKey, child] of Object.entries(node)) {
			if (childKey === 'loc' || childKey === 'start' || childKey === 'end') continue;
			if (childKey === 'metadata' || childKey === 'parent') continue;
			visit(child, node, childKey);
		}
	};
	const visitTsQualifiedRuntimeName = (name) => {
		if (!name || typeof name !== 'object') return;
		if (name.type === 'TSQualifiedName') {
			visitTsQualifiedRuntimeName(name.left);
			return;
		}
		visit(name);
	};
	const visitPatternDefaults = (pattern) => {
		if (!pattern || typeof pattern !== 'object') return;
		if (pattern.type === 'TSParameterProperty') {
			visitPatternDefaults(pattern.parameter);
			return;
		}
		if (pattern.type === 'AssignmentPattern') {
			visitPatternDefaults(pattern.left);
			visit(pattern.right, pattern, 'right');
			return;
		}
		if (pattern.type === 'ArrayPattern') {
			for (const element of pattern.elements ?? []) visitPatternDefaults(element);
			return;
		}
		if (pattern.type === 'ObjectPattern') {
			for (const property of pattern.properties ?? []) {
				if (property.type === 'RestElement') {
					visitPatternDefaults(property.argument);
					continue;
				}
				if (property.computed) visit(property.key, property, 'key');
				visitPatternDefaults(property.value);
			}
			return;
		}
		if (pattern.type === 'RestElement') visitPatternDefaults(pattern.argument);
	};

	visit(ast.body);
}

function isReferenceIdentifier(node, parent, key) {
	if (!parent) return true;
	if (parent.type === 'VariableDeclarator' && key === 'id') return false;
	if (
		(parent.type === 'FunctionDeclaration' ||
			parent.type === 'FunctionExpression' ||
			parent.type === 'ClassDeclaration' ||
			parent.type === 'ClassExpression') &&
		key === 'id'
	) {
		return false;
	}
	if (parent.type === 'MemberExpression' && key === 'property' && !parent.computed) return false;
	if (parent.type === 'JSXMemberExpression' && key === 'property') return false;
	if ((parent.type === 'Property' || parent.type === 'PropertyDefinition') && key === 'key') {
		return parent.computed === true || parent.shorthand === true;
	}
	if (parent.type === 'MethodDefinition' && key === 'key' && !parent.computed) return false;
	if (parent.type === 'LabeledStatement' && key === 'label') return false;
	if (
		(parent.type === 'BreakStatement' || parent.type === 'ContinueStatement') &&
		key === 'label'
	) {
		return false;
	}
	if (parent.type === 'JSXAttribute' && key === 'name') return false;
	if (parent.type === 'ExportSpecifier' && key === 'exported') return false;
	return true;
}

function clientOnlyUseError(filename, node, classified, imported) {
	const moduleId = classified.reference?.moduleId ?? classified.resolvedId ?? classified.request;
	const renderer = classified.reference?.renderer ?? classified.renderer ?? 'unknown';
	return diagnosticError(
		'OCTANE_CLIENT_ONLY_SERVER_USE',
		filename,
		node,
		`Client-only export ${JSON.stringify(imported)} from ${JSON.stringify(moduleId)} (renderer ${JSON.stringify(renderer)}) is used by server code. It may only flow into a boundary child region declared with server: "omit-child"`,
	);
}
