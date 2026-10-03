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

const SKIP = new Set([
	'loc',
	'start',
	'end',
	'range',
	'metadata',
	'parent',
	'typeAnnotation',
	'typeArguments',
	'typeParameters',
	'returnType',
	'label',
]);
const CONTROLLED = new Set(['input', 'textarea', 'select']);
const SIGNAL_DECLARATIONS = new Set(['signal$', 'derived$', 'query$', 'action$']);
const HOOK = /^use(?:[A-Z0-9_]|$)/;

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

/** The static name of a member access (`a.b`, `a['b']`), or null. */
function propertyOf(node) {
	const property = node.property;
	if (!node.computed) return property?.name ?? null;
	return property?.type === 'Literal' && typeof property.value === 'string' ? property.value : null;
}

function attributeName(attribute) {
	const name = attribute.name;
	return name?.type === 'JSXNamespacedName'
		? `${name.namespace.name}:${name.name.name}`
		: (name?.name ?? null);
}

/**
 * A component the shell hands to JSX as a value (`render={Item}`) is reported
 * with `value: true`. Check those exports with `{ values: true }`: a function is
 * checked like a rendered component, while an inert or non-component value (a
 * string, an asset URL, a theme object) is not shell output.
 *
 * @param {string} source
 * @param {string} filename
 * @param {readonly string[] | null} exports Rendered exports, or null for every export.
 * @param {{ values?: boolean }} [options] The selected exports were passed as values.
 * @returns {{
 *   problems: Array<{ message: string, line: number, column: number }>,
 *   components: Array<{ source: string, exportName: string, value?: true }>,
 * }}
 */
export function analyzeIslandsShell(
	source,
	filename,
	exports = null,
	{ values: passedValues = false } = {},
) {
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
	// A rendered component is checked strictly; a value only if it can render.
	const component = (record, value = false) => {
		const key = `${record.source}#${record.imported}`;
		if (value && components.has(key)) return;
		components.set(
			key,
			value
				? { source: record.source, exportName: record.imported, value: true }
				: { source: record.source, exportName: record.imported },
		);
	};
	// The name a callee was exported as: an import alias does not hide a hook.
	const importedName = (name) => {
		const record = imports.get(name);
		return record === undefined || record.imported === '*' || record.imported === 'default'
			? name
			: record.imported;
	};
	// A signal handle, directly, through a member, or through an import or
	// module-level alias.
	const isHandle = (node, seen = new Set()) => {
		node = unwrap(node);
		if (node?.type === 'MemberExpression') return /\$$/.test(propertyOf(node) ?? '');
		if (node?.type !== 'Identifier') return false;
		if (/\$$/.test(node.name) || /\$$/.test(importedName(node.name))) return true;
		if (seen.has(node.name)) return false;
		seen.add(node.name);
		return isHandle(values.get(node.name), seen);
	};
	// Follow module-level `const A = B` aliases to the binding they name.
	const aliased = (name) => {
		const seen = new Set();
		for (let value = unwrap(values.get(name)); value?.type === 'Identifier';) {
			if (seen.has(name)) break;
			seen.add(name);
			name = value.name;
			value = unwrap(values.get(name));
		}
		return name;
	};
	// A value passed into JSX may be rendered as a component by its receiver.
	const passed = (node) => {
		node = unwrap(node);
		if (node?.type === 'Identifier') {
			const name = aliased(node.name);
			const fn = functions.get(name);
			if (fn !== undefined) {
				enqueue(fn);
				return;
			}
			const record = imports.get(name);
			if (record === undefined) {
				// A module-level wrapper (`memo(...)`) is as uncheckable here as a tag.
				const value = unwrap(values.get(name));
				if (value != null && /^[A-Z]/.test(name) && !INERT.has(value.type))
					report(node, `component ${node.name} cannot be checked as static shell output`);
			} else if (relative(record)) component(record, true);
			else if (/^[A-Z]/.test(name) && !/^octane(?:\/|$)/.test(record.source))
				report(node, `component ${node.name} cannot be checked as static shell output`);
		} else if (node?.type === 'MemberExpression') {
			// `UI.Button` through a namespace import names that module's export.
			const object = unwrap(node.object);
			const record = object?.type === 'Identifier' ? imports.get(aliased(object.name)) : undefined;
			const property = propertyOf(node);
			if (record === undefined || property === null || !/^[A-Z]/.test(property)) return;
			if (record.imported === '*' && /^\.\.?\//.test(record.source))
				component({ source: record.source, imported: property }, true);
			else if (!/^octane(?:\/|$)/.test(record.source))
				report(
					node,
					`component ${object.name}.${property} cannot be checked as static shell output`,
				);
		} else if (node?.type === 'ArrayExpression') {
			for (const element of node.elements) passed(element);
		} else if (node?.type === 'ObjectExpression') {
			for (const property of node.properties) passed(property.value ?? property.argument);
		} else if (node?.type === 'ConditionalExpression') {
			passed(node.consequent);
			passed(node.alternate);
		} else if (node?.type === 'LogicalExpression') {
			passed(node.left);
			passed(node.right);
		}
	};
	// Follow one export to the component it names, failing closed when the
	// source alone cannot say what renders.
	const follow = (name, target, statement) => {
		const local = target?.local;
		const record = target?.source ? target : local !== undefined ? imports.get(local) : undefined;
		if (target?.fn) enqueue(target.fn);
		else if (local !== undefined && functions.has(local)) enqueue(functions.get(local));
		else if (record && relative(record)) component(record, passedValues);
		else if (
			(exports === null || passedValues) &&
			INERT.has((local !== undefined ? values.get(local) : target?.value)?.type)
		)
			return;
		// A passed value that is neither a function nor named like a component
		// (a computed string or URL) renders nothing interactive. A default
		// export carries no name to tell, so it is checked like a component.
		else if (passedValues && name !== 'default' && !/^[A-Z]/.test(name)) return;
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
	// A binding introduces names; only its default values and computed keys run.
	const pattern = (node) => {
		if (node == null || node.type === 'Identifier') return;
		if (node.type === 'AssignmentPattern') {
			pattern(node.left);
			visit(node.right);
		} else if (node.type === 'ObjectPattern') {
			for (const property of node.properties) {
				if (property.type === 'RestElement') pattern(property.argument);
				else {
					if (property.computed) visit(property.key);
					pattern(property.value);
				}
			}
		} else if (node.type === 'ArrayPattern') {
			for (const element of node.elements) pattern(element);
		} else if (node.type === 'RestElement') pattern(node.argument);
		else if (node.type === 'TSParameterProperty') pattern(node.parameter);
		else visit(node);
	};
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
				else if (attribute.value?.type === 'JSXExpressionContainer')
					passed(attribute.value.expression);
			}
			for (const child of node.children ?? [])
				if (child.type === 'JSXExpressionContainer') passed(child.expression);
		} else if (node.type === 'JSXTryExpression' || node.type === 'TryStatement') {
			report(node, '@try recovery needs the renderer; move it into an independent island');
		} else if (node.type === 'JSXExpressionContainer' && isHandle(node.expression)) {
			report(node, 'a signal handle binding needs client code the shell never loads');
		} else if (node.type === 'CallExpression') {
			const callee = unwrap(node.callee);
			const local = nameOf(callee);
			const name = local === null ? null : importedName(local);
			// `O.useState()` and `React.useEffect()` are hooks through their namespace.
			const member = callee?.type === 'MemberExpression' ? propertyOf(callee) : null;
			if (name !== null && HOOK.test(name)) report(node, `hook ${name}() needs the renderer`);
			else if (member !== null && HOOK.test(member))
				report(node, `hook ${member}() needs the renderer`);
			else if (
				(name !== null && SIGNAL_DECLARATIONS.has(name)) ||
				(member !== null && SIGNAL_DECLARATIONS.has(member))
			)
				report(node, 'a component signal declaration needs the renderer');
			else if (member === 'get' || member === 'latest' || member === 'snapshot')
				report(node, `a signal .${member}() read is not live in a static shell`);
		} else if (node.type === 'VariableDeclarator') {
			pattern(node.id);
			if (node.init) visit(node.init);
			return;
		} else if (FUNCTIONS.has(node.type)) {
			// A nested function's own name and parameters are bindings.
			for (const parameter of node.params) pattern(parameter);
			visit(node.body);
			return;
		} else if (node.type === 'CatchClause') {
			pattern(node.param);
			visit(node.body);
			return;
		} else if (node.type === 'Identifier') {
			// Any local function the shell references may run or render on the
			// server, whether as a tag, a call, or a value handed to a component.
			const fn = functions.get(aliased(node.name));
			if (fn !== undefined) enqueue(fn);
		} else if (node.type === 'MemberExpression' && !node.computed) {
			visit(node.object);
			return;
		} else if (node.type === 'Property' && !node.computed) {
			visit(node.value);
			return;
		}
		for (const child of children(node)) visit(child);
	};
	while (queue.length > 0) {
		const fn = queue.shift();
		for (const parameter of fn.params) pattern(parameter);
		visit(fn.body);
	}
	return { problems, components: [...components.values()] };
}
