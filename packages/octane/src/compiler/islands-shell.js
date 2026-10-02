/**
 * Fail-closed check for the shell of a `hydrate: 'islands'` route. The shell is
 * server-rendered once and never loads in the browser, so any construct that
 * needs client work there is an error. Independent `<Hydrate>` children are the
 * islands and activate on their own; they are not part of the shell.
 *
 * This is a conservative source check of the components a shell module
 * renders, not a semantic proof: unknown components and opaque constructs are
 * rejected rather than assumed static.
 */
import { parseModule } from '@tsrx/core';

const SKIP = new Set(['loc', 'start', 'end', 'range', 'metadata', 'parent', 'typeAnnotation']);
const CONTROLLED = new Set(['input', 'textarea', 'select']);
const SIGNAL_DECLARATIONS = new Set(['signal$', 'derived$', 'query$', 'action$']);

function children(node) {
	const result = [];
	for (const [key, value] of Object.entries(node)) {
		if (SKIP.has(key) || !value || typeof value !== 'object') continue;
		if (Array.isArray(value)) {
			for (const child of value) if (child && typeof child.type === 'string') result.push(child);
		} else if (typeof value.type === 'string') result.push(value);
	}
	return result;
}

const TYPE_WRAPPERS = new Set([
	'TSAsExpression',
	'TSSatisfiesExpression',
	'TSNonNullExpression',
	'TSTypeAssertion',
	'ParenthesizedExpression',
]);

const FUNCTIONS = new Set(['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression']);
// Exported values that are provably not components.
const INERT = new Set(['Literal', 'TemplateLiteral', 'ObjectExpression', 'ArrayExpression']);

function unwrap(node) {
	while (TYPE_WRAPPERS.has(node?.type) || node?.type === 'ChainExpression') node = node.expression;
	return node;
}

function nameOf(node) {
	node = unwrap(node);
	return node?.type === 'JSXIdentifier' || node?.type === 'Identifier' ? node.name : null;
}

function exportedName(node) {
	return node.type === 'Identifier' ? node.name : node.value;
}

function attributeName(attribute) {
	const name = attribute.name;
	return name?.type === 'JSXNamespacedName'
		? `${name.namespace.name}:${name.name.name}`
		: (name?.name ?? null);
}

/**
 * @param {string} source
 * @param {string} filename
 * @param {readonly string[] | null} exports Rendered exports, or null for every export.
 * @returns {{
 *   problems: Array<{ message: string, line: number, column: number }>,
 *   components: Array<{ source: string, exportName: string }>,
 * }}
 */
export function analyzeIslandsShell(source, filename, exports = null) {
	const ast = parseModule(source, filename);
	const imports = new Map();
	// Local bindings that hold a function (declarations and function-valued
	// `const`s), and the values of those that do not.
	const functions = new Map();
	const values = new Map();
	// Every exported binding in source order: [name, target, statement].
	const exported = [];
	let star = null;
	const declare = (declaration) => {
		if (declaration?.type === 'FunctionDeclaration' && declaration.id) {
			functions.set(declaration.id.name, declaration);
			return [declaration.id.name];
		}
		if (declaration?.type !== 'VariableDeclaration') return [];
		const names = [];
		for (const declarator of declaration.declarations) {
			if (declarator.id.type !== 'Identifier') continue;
			const value = unwrap(declarator.init);
			if (FUNCTIONS.has(value?.type)) functions.set(declarator.id.name, value);
			else values.set(declarator.id.name, value);
			names.push(declarator.id.name);
		}
		return names;
	};
	for (const statement of ast.body) {
		if (statement.type === 'ImportDeclaration') {
			if (statement.importKind === 'type') continue;
			for (const specifier of statement.specifiers ?? []) {
				if (specifier.importKind === 'type') continue;
				imports.set(specifier.local.name, {
					source: statement.source.value,
					imported:
						specifier.type === 'ImportSpecifier'
							? (specifier.imported.name ?? specifier.imported.value)
							: specifier.type === 'ImportDefaultSpecifier'
								? 'default'
								: '*',
				});
			}
			continue;
		}
		if (statement.type === 'ExportDefaultDeclaration') {
			const value = unwrap(statement.declaration);
			if (value?.type === 'FunctionDeclaration' && value.id) functions.set(value.id.name, value);
			exported.push([
				'default',
				FUNCTIONS.has(value?.type)
					? { fn: value }
					: value?.type === 'Identifier'
						? { local: value.name }
						: { value },
				statement,
			]);
		} else if (statement.type === 'ExportNamedDeclaration') {
			if (statement.exportKind === 'type') continue;
			for (const name of declare(statement.declaration))
				exported.push([name, { local: name }, statement]);
			if (statement.declaration?.type === 'ClassDeclaration')
				exported.push([statement.declaration.id.name, {}, statement]);
			for (const specifier of statement.specifiers ?? []) {
				if (specifier.exportKind === 'type') continue;
				const local = exportedName(specifier.local);
				exported.push([
					exportedName(specifier.exported),
					statement.source ? { source: statement.source.value, imported: local } : { local },
					statement,
				]);
			}
		} else if (statement.type === 'ExportAllDeclaration') {
			if (statement.exportKind === 'type') continue;
			if (statement.exported) exported.push([exportedName(statement.exported), {}, statement]);
			else star ??= statement;
		} else declare(statement);
	}
	const problems = [];
	const components = new Map();
	const report = (node, message) =>
		problems.push({
			message,
			line: node?.loc?.start?.line ?? 1,
			column: (node?.loc?.start?.column ?? 0) + 1,
		});
	const octane = (local, imported) => {
		const record = imports.get(local);
		return record?.source === 'octane' && record.imported === imported;
	};
	const queued = new Set();
	const queue = [];
	const enqueue = (fn) => {
		if (queued.has(fn)) return;
		queued.add(fn);
		queue.push(fn);
	};
	const relative = (record) => /^\.\.?\//.test(record.source) && record.imported !== '*';
	const component = (record) =>
		components.set(`${record.source}#${record.imported}`, {
			source: record.source,
			exportName: record.imported,
		});
	// Follow one export to the component it names, failing closed when the
	// source alone cannot say what renders.
	const follow = (name, target, statement) => {
		const local = target?.local;
		const record = target?.source ? target : local !== undefined ? imports.get(local) : undefined;
		if (target?.fn) enqueue(target.fn);
		else if (local !== undefined && functions.has(local)) enqueue(functions.get(local));
		else if (record && relative(record)) component(record);
		else if (
			exports === null &&
			INERT.has((local !== undefined ? values.get(local) : target?.value)?.type)
		)
			return;
		else
			report(statement, `export ${JSON.stringify(name)} cannot be checked as static shell output`);
	};
	if (exports === null) {
		// The route renders the default export, else the first PascalCase function.
		for (const [name, target, statement] of exported)
			if (name === 'default' || /^[A-Z]/.test(name)) follow(name, target, statement);
		if (star) report(star, '`export *` cannot be checked as static shell output');
	} else
		for (const name of exports) {
			const entry = exported.find(([exportedAs]) => exportedAs === name);
			follow(name, entry?.[1], entry?.[2] ?? star);
		}
	const visit = (node) => {
		if (node.type === 'JSXElement') {
			const opening = node.openingElement;
			const tag = nameOf(opening.name);
			const attributes = opening.attributes ?? [];
			if (tag !== null && octane(tag, 'Hydrate')) {
				// An independent island activates on its own; it is not shell work. As in
				// the compiler, only a bare `independent` or the literal `true` asks for one.
				const independent = attributes.find(
					(attribute) => attributeName(attribute) === 'independent',
				);
				const value =
					independent?.value?.type === 'JSXExpressionContainer'
						? unwrap(independent.value.expression)
						: independent?.value;
				if (independent && (value == null || (value.type === 'Literal' && value.value === true)))
					return;
				report(node, 'an ordinary <Hydrate> needs the renderer to hydrate its children');
			} else if (tag !== null && /^[A-Z]/.test(tag) && !octane(tag, 'Fragment')) {
				const local = functions.get(tag);
				const record = imports.get(tag);
				if (local) enqueue(local);
				else if (record && relative(record)) component(record);
				else report(node, `component <${tag}> cannot be checked as static shell output`);
			} else if (opening.name.type === 'JSXMemberExpression') {
				report(node, 'a namespaced component cannot be checked as static shell output');
			}
			for (const attribute of attributes) {
				if (attribute.type === 'JSXSpreadAttribute' || attribute.type === 'SpreadAttribute') {
					report(attribute, 'an attribute spread cannot be checked as static shell output');
					continue;
				}
				const name = attributeName(attribute) ?? '';
				if (name === 'ref' || /^on[A-Z]/.test(name))
					report(attribute, `${JSON.stringify(name)} needs client code the shell never loads`);
				else if (
					(name === 'value' || name === 'checked') &&
					CONTROLLED.has(tag ?? '') &&
					attribute.value?.type === 'JSXExpressionContainer' &&
					attribute.value.expression.type !== 'Literal'
				)
					report(attribute, `a controlled ${JSON.stringify(name)} needs the renderer`);
			}
		} else if (node.type === 'JSXTryExpression' || node.type === 'TryStatement') {
			report(node, '@try recovery needs the renderer; move it into an independent island');
		} else if (
			node.type === 'JSXExpressionContainer' &&
			/\$$/.test(nameOf(node.expression) ?? '')
		) {
			report(node, 'a signal handle binding needs client code the shell never loads');
		} else if (node.type === 'CallExpression') {
			const callee = unwrap(node.callee);
			const name = nameOf(callee);
			const property = callee?.type === 'MemberExpression' ? callee.property : null;
			const member = !callee?.computed
				? property?.name
				: property?.type === 'Literal'
					? property.value
					: null;
			if (name !== null && /^use(?:[A-Z0-9_]|$)/.test(name))
				report(node, `hook ${name}() needs the renderer`);
			else if (name !== null && SIGNAL_DECLARATIONS.has(name))
				report(node, 'a component signal declaration needs the renderer');
			else if (member === 'get' || member === 'latest' || member === 'snapshot')
				report(node, `a signal .${member}() read is not live in a static shell`);
		}
		for (const child of children(node)) visit(child);
	};
	while (queue.length > 0) {
		const fn = queue.shift();
		for (const parameter of fn.params) visit(parameter);
		visit(fn.body);
	}
	return { problems, components: [...components.values()] };
}
