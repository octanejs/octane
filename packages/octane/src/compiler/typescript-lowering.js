// Lowering for the TypeScript declarations that carry RUNTIME semantics:
// `enum`, value `namespace`, entity-name `import X = A.B` aliases, and class
// parameter properties (`constructor(private x)`).
//
// A `.tsrx` module is never TS-transformed after Octane (Vite type-strips only
// `.ts`/`.tsx`), so the compiler's single print must already be plain
// JavaScript. Type-only surface is simply dropped (see isTypeOnlyStatement in
// compile.js); these constructs instead expand to the same JavaScript tsc
// emits for an ES2022 module target:
//
//   enum E { A, B = 'b' }       var E;
//                               (function (E) {
//                                 E[E["A"] = 0] = "A";
//                                 E["B"] = "b";
//                               })(E || (E = {}));
//
//   namespace N {               var N;
//     export const x = 1;       (function (N) {
//     export function f() {}      N.x = 1;
//     const y = x;                function f() {}
//   }                             N.f = f;
//                                 const y = N.x;
//                               })(N || (N = {}));
//
// Declaration merging keeps one binding (`var` only on the first declaration in
// a statement list, none when a function/class already owns the name), and an
// exported enum/namespace inside a namespace binds through `E = N.E || (N.E = {})`.
// `const enum` is emitted as a regular enum (tsc's `preserveConstEnums` /
// isolatedModules behavior): the values are identical and references stay
// valid across modules. Enum member initializers are constant-folded like tsc,
// so string members get no reverse mapping and bare member references resolve
// to members.
//
// Constructs that have no ESM lowering (`export =`, `import x = require()`) are
// rejected with a diagnostic rather than printed as a parse error for the
// bundler to report.
//
// Everything here is copy-on-write: authored nodes are only ever shared or
// shallow-copied (tests deep-freeze adopted parser ASTs). Freshly built nodes
// carry their origin's loc so the print's source map stays complete.

import { builders as b } from '@tsrx/core';
import { createLexicalAnalysis, isIdentifierReference } from './compile-universal.js';

const NOT_CONSTANT = Symbol('not constant');

export const TS_ENUM_INITIALIZER_REQUIRED = 'OCTANE_TS_ENUM_INITIALIZER_REQUIRED';
export const TS_EXPORT_ASSIGNMENT_UNSUPPORTED = 'OCTANE_TS_EXPORT_ASSIGNMENT_UNSUPPORTED';
export const TS_IMPORT_REQUIRE_UNSUPPORTED = 'OCTANE_TS_IMPORT_REQUIRE_UNSUPPORTED';
export const TS_NAMESPACE_EXPORT_UNSUPPORTED = 'OCTANE_TS_NAMESPACE_EXPORT_UNSUPPORTED';
export const TS_PARAMETER_PROPERTY_UNSUPPORTED = 'OCTANE_TS_PARAMETER_PROPERTY_UNSUPPORTED';

function diagnostic(code, filename, node, message) {
	const start = node?.loc?.start;
	const at = start ? `${filename}:${start.line}:${start.column}` : filename;
	const error = new Error(`${message} (${at})`);
	error.code = code;
	error.filename = filename;
	error.loc = start ? Object.freeze({ line: start.line, column: start.column }) : null;
	return error;
}

// Builder output stamped with its origin's position (see assertNodeLocs in
// compile.js). Only ever applied to freshly built nodes.
function at(origin, node) {
	return b.set_location(node, origin);
}

const id = (origin, name) => b.id(name, origin);
const str = (origin, value) => b.literal(value, JSON.stringify(value), origin);
const member = (origin, object, name) => at(origin, b.member(object, id(origin, name)));
const index = (origin, object, property) => at(origin, b.member(object, property, true));
const assign = (origin, left, right) => at(origin, b.assignment('=', left, right));
const stmt = (origin, expression) => at(origin, b.stmt(expression));
const declare = (origin, kind, name, init = null, exported = false) => {
	const declaration = at(
		origin,
		b.declaration(kind, [at(origin, b.declarator(id(origin, name), init))]),
	);
	return exported ? at(origin, b.export(declaration)) : declaration;
};

function literalFor(origin, value) {
	if (typeof value === 'string') return str(origin, value);
	if (Number.isNaN(value)) return id(origin, 'NaN');
	if (value < 0 || Object.is(value, -0)) {
		return at(origin, b.unary('-', literalFor(origin, -value)));
	}
	if (value === Infinity) return id(origin, 'Infinity');
	return b.literal(value, String(value), origin);
}

// `function (Name) { ...body }` — the scope an enum/namespace body runs in.
function scopeFunction(origin, name, body) {
	return b.function(null, [id(origin, name)], b.block(body, origin), false, undefined, origin);
}

// `(fn)(binding);`
function invoke(origin, fn, binding) {
	return stmt(origin, at(origin, b.call(fn, binding)));
}

// `Name || (Name = {})`, or `Name = Parent.Name || (Parent.Name = {})` for a
// declaration exported from an enclosing namespace.
function bindingArgument(origin, name, parent) {
	const target = () =>
		parent === null ? id(origin, name) : member(origin, id(origin, parent), name);
	const binding = at(
		origin,
		b.logical('||', target(), assign(origin, target(), b.object([], origin))),
	);
	return parent === null ? binding : assign(origin, id(origin, name), binding);
}

function unwrapExpression(node) {
	while (
		node != null &&
		(node.type === 'ParenthesizedExpression' ||
			node.type === 'TSAsExpression' ||
			node.type === 'TSSatisfiesExpression' ||
			node.type === 'TSNonNullExpression' ||
			node.type === 'TSTypeAssertion')
	) {
		node = node.expression;
	}
	return node;
}

function enumMemberName(memberNode) {
	const key = memberNode.id;
	if (key?.type === 'Identifier') return key.name;
	if (key?.type === 'Literal') return String(key.value);
	if (key?.type === 'TemplateLiteral' && key.expressions.length === 0) {
		return key.quasis[0].value.cooked;
	}
	return null;
}

// tsc's constant-enum-expression evaluation. `own` holds this enum's members
// (all merged declarations seen so far); `known` resolves `Other.Member` for
// enums lowered earlier in the same or an enclosing statement list.
function evaluate(node, enumName, own, known) {
	node = unwrapExpression(node);
	if (node == null) return NOT_CONSTANT;
	switch (node.type) {
		case 'Literal':
			return typeof node.value === 'number' || typeof node.value === 'string'
				? node.value
				: NOT_CONSTANT;
		case 'TemplateLiteral': {
			let text = node.quasis[0].value.cooked;
			for (let i = 0; i < node.expressions.length; i++) {
				const value = evaluate(node.expressions[i], enumName, own, known);
				if (value === NOT_CONSTANT) return NOT_CONSTANT;
				text += String(value) + node.quasis[i + 1].value.cooked;
			}
			return text;
		}
		case 'Identifier':
			return own.has(node.name) ? own.get(node.name) : NOT_CONSTANT;
		case 'MemberExpression': {
			const object = unwrapExpression(node.object);
			if (object?.type !== 'Identifier') return NOT_CONSTANT;
			const key = node.computed
				? unwrapExpression(node.property)?.type === 'Literal'
					? String(unwrapExpression(node.property).value)
					: null
				: node.property.name;
			if (key == null) return NOT_CONSTANT;
			const values = object.name === enumName ? own : known.get(object.name);
			return values?.has(key) ? values.get(key) : NOT_CONSTANT;
		}
		case 'UnaryExpression': {
			const value = evaluate(node.argument, enumName, own, known);
			if (typeof value !== 'number') return NOT_CONSTANT;
			if (node.operator === '+') return value;
			if (node.operator === '-') return -value;
			if (node.operator === '~') return ~value;
			return NOT_CONSTANT;
		}
		case 'BinaryExpression': {
			const left = evaluate(node.left, enumName, own, known);
			if (left === NOT_CONSTANT) return NOT_CONSTANT;
			const right = evaluate(node.right, enumName, own, known);
			if (right === NOT_CONSTANT) return NOT_CONSTANT;
			if (node.operator === '+') return left + right;
			if (typeof left !== 'number' || typeof right !== 'number') return NOT_CONSTANT;
			switch (node.operator) {
				case '-':
					return left - right;
				case '*':
					return left * right;
				case '/':
					return left / right;
				case '%':
					return left % right;
				case '**':
					return left ** right;
				case '<<':
					return left << right;
				case '>>':
					return left >> right;
				case '>>>':
					return left >>> right;
				case '&':
					return left & right;
				case '|':
					return left | right;
				case '^':
					return left ^ right;
			}
			return NOT_CONSTANT;
		}
	}
	return NOT_CONSTANT;
}

// A non-constant initializer that is nevertheless always a string gets no
// reverse mapping (tsc's isSyntacticallyString).
function isSyntacticallyString(node) {
	node = unwrapExpression(node);
	if (node?.type === 'Literal') return typeof node.value === 'string';
	if (node?.type === 'TemplateLiteral') return true;
	if (node?.type === 'BinaryExpression' && node.operator === '+') {
		return isSyntacticallyString(node.left) || isSyntacticallyString(node.right);
	}
	return false;
}

// Rewrite free references to `names` inside `root` as `qualifier.name`. Bindings
// declared anywhere inside `root` (including the IIFE parameter) shadow them.
function qualifyReferences(root, names, qualifier) {
	if (names.size === 0) return root;
	const lexical = createLexicalAnalysis(root);
	const visit = (node, parent, key) => {
		if (node === null || typeof node !== 'object') return node;
		if (Array.isArray(node)) {
			let out = null;
			for (let i = 0; i < node.length; i++) {
				const mapped = visit(node[i], parent, key);
				if (out === null && mapped !== node[i]) out = node.slice(0, i);
				if (out !== null) out.push(mapped);
			}
			return out ?? node;
		}
		if (node.type === 'Identifier') {
			if (
				names.has(node.name) &&
				isIdentifierReference(node, parent, key, lexical) &&
				!lexical.isBound(lexical.nodeScopes.get(node) ?? lexical.rootScope, node.name)
			) {
				return member(node, id(node, qualifier), node.name);
			}
			return node;
		}
		let out = null;
		for (const field of Object.keys(node)) {
			if (field === 'loc' || field === 'start' || field === 'end' || field === 'metadata') continue;
			// A non-computed key names a property, never a binding reference; a
			// shorthand property is handled through its `value`.
			if (field === 'key' && node.computed !== true) continue;
			const child = node[field];
			if (child === null || typeof child !== 'object') continue;
			const mapped = visit(child, node, field);
			if (mapped !== child) {
				if (out === null) out = { ...node };
				out[field] = mapped;
			}
		}
		// `{ x }` → `{ x: N.x }` once the value is qualified.
		if (out !== null && node.type === 'Property' && node.shorthand === true) out.shorthand = false;
		return out ?? node;
	};
	return visit(root, null, null);
}

// The exported declaration of `export <declaration>`, else null. The
// JavaScript parser marks `export import X = …` with `isExport` on the alias
// itself rather than wrapping it.
function exportedDeclaration(statement) {
	if (statement?.type === 'ExportNamedDeclaration') return statement.declaration ?? null;
	if (statement?.type === 'TSImportEqualsDeclaration' && statement.isExport === true) {
		return statement;
	}
	return null;
}

function isValueNamespace(node, isTypeOnlyStatement) {
	return (
		node?.type === 'TSModuleDeclaration' &&
		node.kind === 'namespace' &&
		node.declare !== true &&
		!isTypeOnlyStatement(node)
	);
}

// `namespace A.B.C {…}` → [A, B, C]. The native parser spells the dotted id
// as a TSQualifiedName; the JavaScript parser nests one TSModuleDeclaration
// per segment instead.
function namespacePath(node) {
	const names = [];
	let current = node.id;
	while (current?.type === 'TSQualifiedName') {
		names.unshift(current.right.name);
		current = current.left;
	}
	if (current?.type === 'Identifier') names.unshift(current.name);
	if (node.body?.type === 'TSModuleDeclaration') names.push(...namespacePath(node.body));
	return names;
}

function namespaceBody(node) {
	let body = node.body;
	while (body?.type === 'TSModuleDeclaration') body = body.body;
	return body?.type === 'TSModuleBlock' ? body.body : [];
}

function valueDeclarationNames(declaration, out) {
	switch (declaration?.type) {
		case 'FunctionDeclaration':
		case 'TSDeclareFunction':
		case 'ClassDeclaration':
		case 'TSEnumDeclaration':
		case 'TSImportEqualsDeclaration':
			if (declaration.id?.type === 'Identifier') out.push(declaration.id.name);
			return;
		case 'TSModuleDeclaration':
			if (declaration.kind === 'namespace') out.push(namespacePath(declaration)[0]);
			return;
		case 'VariableDeclaration':
			for (const declarator of declaration.declarations ?? []) {
				if (declarator.id?.type === 'Identifier') out.push(declarator.id.name);
			}
	}
}

// Map "A.B" → every value name any merged `A.B` declaration exports, so a
// reference in one block to another block's export is qualified. Keyed by the
// full dotted path because each dotted/merged block lowers independently.
function collectNamespaceExports(statements, prefix, exportsByPath, isTypeOnlyStatement) {
	for (const statement of statements) {
		const exported = exportedDeclaration(statement);
		const declaration = exported ?? statement;
		if (prefix !== null && exported !== null) {
			// `export declare const x` still names `N.x` for sibling references.
			const names = [];
			if (declaration.type !== 'TSModuleDeclaration' || !isTypeOnlyStatement(declaration)) {
				valueDeclarationNames(declaration, names);
			}
			let set = exportsByPath.get(prefix);
			if (set === undefined) exportsByPath.set(prefix, (set = new Set()));
			for (const name of names) set.add(name);
		}
		if (!isValueNamespace(declaration, isTypeOnlyStatement)) continue;
		const path = namespacePath(declaration);
		let current = prefix;
		for (let i = 0; i < path.length; i++) {
			if (current !== null && i > 0) {
				let set = exportsByPath.get(current);
				if (set === undefined) exportsByPath.set(current, (set = new Set()));
				set.add(path[i]);
			}
			current = current === null ? path[i] : `${current}.${path[i]}`;
		}
		collectNamespaceExports(
			namespaceBody(declaration),
			current,
			exportsByPath,
			isTypeOnlyStatement,
		);
	}
}

/**
 * Whether a statement-list item needs lowering here. Cheap enough to run on
 * every array item stripTsOnlyWrappers visits.
 */
export function needsTypeScriptStatementLowering(statement) {
	const declaration = exportedDeclaration(statement) ?? statement;
	const type = declaration?.type;
	return (
		(type === 'TSEnumDeclaration' && declaration.declare !== true) ||
		(type === 'TSModuleDeclaration' && declaration.kind === 'namespace') ||
		type === 'TSImportEqualsDeclaration' ||
		type === 'TSExportAssignment'
	);
}

/**
 * Lower one statement list. `options`:
 *   topLevel            — the Program body (bindings use `var`, like tsc)
 *   strip               — compile.js stripTsOnlyWrappers, applied to every
 *                         statement this pass passes through or builds; it
 *                         carries the enums visible at that point into
 *                         nested lists so `Outer.Member` still folds
 *   enums               — enum values visible from enclosing lists
 *   isTypeOnlyStatement — compile.js's type-only statement predicate
 *   filename            — for diagnostics
 */
export function lowerTypeScriptStatements(statements, options) {
	const exportsByPath = new Map();
	collectNamespaceExports(statements, null, exportsByPath, options.isTypeOnlyStatement);
	return lowerList(statements, options, {
		topLevel: options.topLevel,
		namespace: null,
		path: null,
		exportsByPath,
		enums: options.enums ?? new Map(),
	});
}

function lowerList(statements, options, scope) {
	const { strip, isTypeOnlyStatement, filename } = options;
	// Names already bound in this list: a merged enum/namespace reuses them
	// instead of redeclaring (tsc: `function f(){}` + `namespace f {}`).
	const bound = new Set();
	for (const statement of statements) {
		const declaration =
			statement.type === 'ExportDefaultDeclaration'
				? statement.declaration
				: (exportedDeclaration(statement) ?? statement);
		if (
			(declaration.type === 'FunctionDeclaration' || declaration.type === 'ClassDeclaration') &&
			declaration.id != null
		) {
			bound.add(declaration.id.name);
		}
	}
	// Enum values visible here: this list's enums shadow the enclosing lists'.
	const enums = new Map(scope.enums);
	const kind = scope.topLevel ? 'var' : 'let';
	const out = [];
	const aliases = [];
	for (const statement of statements) {
		if (isTypeOnlyStatement(statement)) continue;
		const exported = exportedDeclaration(statement);
		const declaration = exported ?? statement;
		const isExported = exported !== null;
		if (scope.namespace !== null && statement.type === 'ExportNamedDeclaration' && !isExported) {
			throw diagnostic(
				TS_NAMESPACE_EXPORT_UNSUPPORTED,
				filename,
				statement,
				'Export lists are not allowed inside a namespace; export the declaration itself.',
			);
		}
		if (scope.namespace !== null && statement.type === 'ExportDefaultDeclaration') {
			throw diagnostic(
				TS_NAMESPACE_EXPORT_UNSUPPORTED,
				filename,
				statement,
				'A namespace cannot have a default export.',
			);
		}
		if (declaration.type === 'TSExportAssignment') {
			throw diagnostic(
				TS_EXPORT_ASSIGNMENT_UNSUPPORTED,
				filename,
				declaration,
				'`export =` cannot be compiled to an ES module. Use `export default` instead.',
			);
		}
		if (declaration.type === 'TSEnumDeclaration' && declaration.declare !== true) {
			const name = declaration.id.name;
			const first = !bound.has(name);
			bound.add(name);
			out.push(...lowerEnum(declaration, isExported, first, kind, scope, enums, options));
			continue;
		}
		if (isValueNamespace(declaration, isTypeOnlyStatement)) {
			const names = namespacePath(declaration);
			const first = !bound.has(names[0]);
			bound.add(names[0]);
			out.push(
				...lowerNamespace(declaration, names, 0, isExported, first, kind, scope, enums, options),
			);
			continue;
		}
		if (declaration.type === 'TSImportEqualsDeclaration') {
			if (declaration.importKind === 'type') continue;
			if (declaration.moduleReference?.type === 'TSExternalModuleReference') {
				throw diagnostic(
					TS_IMPORT_REQUIRE_UNSUPPORTED,
					filename,
					declaration,
					'`import x = require(…)` cannot be compiled to an ES module. Use an `import` declaration instead.',
				);
			}
			const value = entityExpression(declaration.moduleReference);
			const name = declaration.id.name;
			if (isExported && scope.namespace !== null) {
				out.push(
					stmt(
						declaration,
						assign(declaration, member(declaration, id(declaration, scope.namespace), name), value),
					),
				);
			} else {
				const alias = declare(declaration, 'var', name, value, isExported);
				if (!isExported) aliases.push(alias);
				out.push(alias);
			}
			continue;
		}
		if (scope.namespace !== null && isExported) {
			out.push(...lowerNamespaceExport(statement, declaration, scope.namespace, options, enums));
			continue;
		}
		out.push(strip(statement, enums));
	}
	// Like tsc, a local alias nothing reads as a value is elided: it may name a
	// type-only namespace, which has no runtime binding at all. Types are
	// already stripped from `out`, so any remaining same-named identifier keeps
	// the alias (conservatively, even when shadowed).
	if (aliases.length === 0) return out;
	return out.filter(
		(statement) =>
			!aliases.includes(statement) ||
			out.some(
				(other) => other !== statement && mentionsName(other, statement.declarations[0].id.name),
			),
	);
}

function mentionsName(node, name) {
	if (node === null || typeof node !== 'object') return false;
	if (Array.isArray(node)) return node.some((item) => mentionsName(item, name));
	if (node.type === 'Identifier') return node.name === name;
	for (const key of Object.keys(node)) {
		if (key === 'loc' || key === 'start' || key === 'end' || key === 'metadata') continue;
		if (mentionsName(node[key], name)) return true;
	}
	return false;
}

function entityExpression(node) {
	if (node.type === 'TSQualifiedName') {
		return member(node, entityExpression(node.left), node.right.name);
	}
	return id(node, node.name);
}

function lowerNamespaceExport(statement, declaration, namespace, options, enums) {
	const { strip, filename } = options;
	if (declaration.type === 'VariableDeclaration') {
		const out = [];
		for (const declarator of declaration.declarations) {
			if (declarator.id.type !== 'Identifier') {
				throw diagnostic(
					TS_NAMESPACE_EXPORT_UNSUPPORTED,
					filename,
					declarator,
					'Destructured namespace exports are not supported. Export each name separately.',
				);
			}
			// `export let x;` declares `N.x` without emitting anything.
			if (declarator.init == null) continue;
			out.push(
				stmt(
					declarator,
					assign(
						declarator,
						member(declarator.id, id(declarator, namespace), declarator.id.name),
						strip(declarator.init, enums),
					),
				),
			);
		}
		return out;
	}
	if (
		(declaration.type === 'FunctionDeclaration' || declaration.type === 'ClassDeclaration') &&
		declaration.id != null
	) {
		const name = declaration.id.name;
		return [
			strip(declaration, enums),
			stmt(
				declaration.id,
				assign(
					declaration.id,
					member(declaration.id, id(declaration.id, namespace), name),
					id(declaration.id, name),
				),
			),
		];
	}
	// Ambient exports (`export declare …`) were dropped as type-only already.
	return [strip(statement, enums)];
}

// `names` is the dotted id (`namespace A.B.C`); each segment after the first
// is an exported namespace of the one before it, exactly as tsc desugars it.
function lowerNamespace(node, names, depth, isExported, first, kind, scope, enums, options) {
	const name = names[depth];
	const path = scope.path === null ? name : `${scope.path}.${name}`;
	const inner = {
		topLevel: false,
		namespace: name,
		path,
		exportsByPath: scope.exportsByPath,
		enums,
	};
	const body =
		depth === names.length - 1
			? lowerList(namespaceBody(node), options, inner)
			: lowerNamespace(node, names, depth + 1, true, true, 'let', inner, enums, options);
	const origin = depth === 0 ? node : node.id;
	const parent = isExported ? scope.namespace : null;
	const fn = qualifyReferences(
		scopeFunction(origin, name, body),
		scope.exportsByPath.get(path) ?? new Set(),
		name,
	);
	const call = invoke(origin, fn, bindingArgument(origin, name, parent));
	return withBinding(origin, name, isExported, first, kind, scope, call);
}

function withBinding(node, name, isExported, first, kind, scope, statement) {
	if (!first) return [statement];
	// A top-level export binds through `export var`; an export from inside a
	// namespace binds through the parent object instead (bindingArgument).
	return [declare(node, kind, name, null, isExported && scope.namespace === null), statement];
}

function lowerEnum(node, isExported, first, kind, scope, enums, options) {
	const { strip, filename } = options;
	const name = node.id.name;
	const members = node.body?.members ?? node.members ?? [];
	const own = new Map(enums.get(name));
	const body = [];
	let previous;
	for (let i = 0; i < members.length; i++) {
		const memberNode = members[i];
		const key = enumMemberName(memberNode);
		let valueNode;
		let value;
		let stringValued;
		if (memberNode.initializer != null) {
			value = evaluate(memberNode.initializer, name, own, enums);
			if (value === NOT_CONSTANT) {
				valueNode = strip(memberNode.initializer, enums);
				stringValued = isSyntacticallyString(memberNode.initializer);
			}
		} else if (i === 0) {
			value = 0;
		} else if (typeof previous === 'number') {
			value = previous + 1;
		} else {
			throw diagnostic(
				TS_ENUM_INITIALIZER_REQUIRED,
				filename,
				memberNode,
				`Enum member ${JSON.stringify(key)} must have an initializer because the member before it is not a constant number.`,
			);
		}
		if (value !== NOT_CONSTANT) {
			valueNode = literalFor(memberNode, value);
			stringValued = typeof value === 'string';
		}
		own.set(key, value);
		previous = value;
		const slot = assign(
			memberNode,
			index(memberNode, id(memberNode, name), str(memberNode.id, key)),
			valueNode,
		);
		body.push(
			stmt(
				memberNode,
				stringValued
					? slot
					: assign(
							memberNode,
							index(memberNode, id(memberNode, name), slot),
							str(memberNode.id, key),
						),
			),
		);
	}
	enums.set(name, own);
	const parent = isExported ? scope.namespace : null;
	// A bare member name in a non-constant initializer means that member.
	const fn = qualifyReferences(scopeFunction(node, name, body), new Set(own.keys()), name);
	const call = invoke(node, fn, bindingArgument(node, name, parent));
	return withBinding(node, name, isExported, first, kind, scope, call);
}

/**
 * `constructor(private x, readonly y = 1)` → plain parameters plus
 * `this.x = x; this.y = y;` at the top of the constructor body, after the
 * `super(…)` call in a derived class. Like tsc for an ES2022 target
 * (`useDefineForClassFields`), each property is also declared as a leading
 * class field, so own-key order and define semantics match. Returns the class
 * node unchanged when it has no parameter properties.
 */
export function lowerParameterProperties(node, filename) {
	const elements = node.body?.body;
	if (!Array.isArray(elements)) return node;
	const ctorIndex = elements.findIndex(
		(element) =>
			element.type === 'MethodDefinition' &&
			element.kind === 'constructor' &&
			element.value?.body != null &&
			element.value.params?.some((param) => param.type === 'TSParameterProperty'),
	);
	if (ctorIndex === -1) return node;
	const ctor = elements[ctorIndex];
	const assignments = [];
	const fields = [];
	const params = ctor.value.params.map((param) => {
		if (param.type !== 'TSParameterProperty') return param;
		const binding =
			param.parameter.type === 'AssignmentPattern' ? param.parameter.left : param.parameter;
		if (binding?.type !== 'Identifier') {
			throw diagnostic(
				TS_PARAMETER_PROPERTY_UNSUPPORTED,
				filename,
				param,
				'A parameter property must be a plain identifier.',
			);
		}
		fields.push(at(param, b.prop_def(id(binding, binding.name), null)));
		assignments.push(
			stmt(
				param,
				assign(
					param,
					member(binding, at(param, { ...b.this }), binding.name),
					id(binding, binding.name),
				),
			),
		);
		return param.parameter;
	});
	const statements = ctor.value.body.body;
	let insertAt = 0;
	while (insertAt < statements.length && statements[insertAt].directive != null) insertAt++;
	if (node.superClass != null) {
		const superIndex = statements.findIndex(
			(statement) =>
				statement.type === 'ExpressionStatement' &&
				statement.expression?.type === 'CallExpression' &&
				statement.expression.callee?.type === 'Super',
		);
		if (superIndex === -1) {
			throw diagnostic(
				TS_PARAMETER_PROPERTY_UNSUPPORTED,
				filename,
				ctor,
				'A derived class with parameter properties must call `super(…)` as a top-level constructor statement.',
			);
		}
		insertAt = superIndex + 1;
	}
	const body = [...statements.slice(0, insertAt), ...assignments, ...statements.slice(insertAt)];
	const nextElements = [...fields, ...elements];
	nextElements[fields.length + ctorIndex] = {
		...ctor,
		value: { ...ctor.value, params, body: { ...ctor.value.body, body } },
	};
	return { ...node, body: { ...node.body, body: nextElements } };
}
