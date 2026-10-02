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

function nameOf(node) {
	while (TYPE_WRAPPERS.has(node?.type)) node = node.expression;
	return node?.type === 'JSXIdentifier' || node?.type === 'Identifier' ? node.name : null;
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
	const functions = new Map();
	const roots = [];
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
		const declaration = statement.declaration ?? statement;
		const exported =
			statement.type === 'ExportNamedDeclaration' || statement.type === 'ExportDefaultDeclaration';
		if (declaration?.type === 'FunctionDeclaration' && declaration.id) {
			functions.set(declaration.id.name, declaration);
			const name = statement.type === 'ExportDefaultDeclaration' ? 'default' : declaration.id.name;
			if (exported && (exports === null || exports.includes(name))) roots.push(declaration);
		}
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
	const queue = [...roots];
	for (const root of roots) queued.add(root);
	const visit = (node) => {
		if (node.type === 'JSXElement') {
			const opening = node.openingElement;
			const tag = nameOf(opening.name);
			const attributes = opening.attributes ?? [];
			if (tag !== null && octane(tag, 'Hydrate')) {
				// An independent island activates on its own; it is not shell work.
				if (attributes.some((attribute) => attributeName(attribute) === 'independent')) return;
				report(node, 'an ordinary <Hydrate> needs the renderer to hydrate its children');
			} else if (tag !== null && /^[A-Z]/.test(tag) && !octane(tag, 'Fragment')) {
				const local = functions.get(tag);
				const record = imports.get(tag);
				if (local) {
					if (!queued.has(local)) {
						queued.add(local);
						queue.push(local);
					}
				} else if (record && /^\.\.?\//.test(record.source) && record.imported !== '*')
					components.set(`${record.source}#${record.imported}`, {
						source: record.source,
						exportName: record.imported,
					});
				else report(node, `component <${tag}> cannot be checked as static shell output`);
			} else if (opening.name.type === 'JSXMemberExpression') {
				report(node, 'a namespaced component cannot be checked as static shell output');
			}
			for (const attribute of attributes) {
				if (attribute.type === 'JSXSpreadAttribute') {
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
			const callee = node.callee;
			const name = nameOf(callee);
			const member =
				callee?.type === 'MemberExpression' && !callee.computed ? callee.property.name : null;
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
		for (const child of children(fn.body)) visit(child);
	}
	return { problems, components: [...components.values()] };
}
