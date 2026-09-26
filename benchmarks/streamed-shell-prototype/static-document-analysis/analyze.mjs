import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const repo = path.resolve(import.meta.dirname, '../../..');
const require = createRequire(path.join(repo, 'packages/octane/package.json'));
const { parseModule } = await import(pathToFileURL(require.resolve('@tsrx/core')).href);
const { compile } = await import(pathToFileURL(require.resolve('octane/compiler')).href);
const cssSha256 = '1203ef2c7f2ee539b59a34f040e76cd497b9090b8dd781d8f4acb791e6fcc044';
const sha256 = (text) => createHash('sha256').update(text).digest('hex');

class Unsupported extends Error {}
const requireShape = (condition, reason) => {
	if (!condition) throw new Unsupported(reason);
};
const name = (node) => (node?.type === 'Identifier' && !node.typeAnnotation ? node.name : null);
const jsxName = (node) => (node?.type === 'JSXIdentifier' ? node.name : null);
const safeDataText = (value) =>
	typeof value === 'string' && value.isWellFormed() && !/[\u0000-\u001f\u007f-\u009f&]/.test(value);
const safeJsxText = (value) =>
	typeof value === 'string' &&
	value.isWellFormed() &&
	!/[\u0000-\u0008\u000b-\u001f\u007f-\u009f&]/.test(value);
const text = (node, source) =>
	node?.type === 'JSXText' &&
	safeJsxText(node.value) &&
	safeJsxText(source.slice(node.start, node.end));
const dataLocals = new Map([
	['TOOLS', 'tool'],
	['ENDPOINTS', 'endpoint'],
]);
const indexRead = (node, local, indices) =>
	node?.type === 'MemberExpression' &&
	node.computed === true &&
	node.optional === false &&
	name(node.object) === local &&
	node.property?.type === 'Literal' &&
	indices.includes(node.property.value);

// This recognizes only the exact Landing stylesheet. General CSS purity and
// global style ownership are separate questions, not inferred by this probe.
function style(node) {
	requireShape(node?.type === 'JSXStyleElement', 'missing-scoped-style');
	requireShape(
		jsxName(node.openingElement?.name) === 'style' &&
			!node.openingElement.selfClosing &&
			node.openingElement.attributes.length === 0 &&
			jsxName(node.closingElement?.name) === 'style',
		'unsupported-style',
	);
	requireShape(
		node.children.length === 1 &&
			node.children[0].type === 'StyleSheet' &&
			typeof node.css === 'string' &&
			node.css === node.children[0].source &&
			sha256(node.css) === cssSha256,
		'unsupported-css',
	);
}

function literalAttribute(attribute, tag, source) {
	requireShape(
		attribute.type === 'JSXAttribute' && jsxName(attribute.name) !== null,
		'unsupported-attribute',
	);
	const attributeName = jsxName(attribute.name);
	requireShape(
		attribute.value?.type === 'Literal' && safeDataText(attribute.value.value),
		'dynamic-attribute',
	);
	const value = attribute.value.value;
	const raw = source.slice(attribute.value.start, attribute.value.end);
	// Reject entities and escape sequences even when a parser decodes them to a
	// seemingly safe value; only simple single/double quoted literals are allowed.
	requireShape(raw === `"${value}"` || raw === `'${value}'`, 'encoded-attribute');
	if (attributeName === 'class') {
		requireShape(/^[a-z][a-z0-9_-]*(?: [a-z][a-z0-9_-]*)*$/.test(value), 'unsupported-class');
		return attributeName;
	}
	requireShape(attributeName === 'href' && tag === 'a', 'unsupported-attribute');
	requireShape(
		/^https:\/\/[a-z0-9]+(?:[-.][a-z0-9]+)*(?:\/[a-zA-Z0-9._~/-]*)?$/.test(value),
		'unsafe-url',
	);
	return attributeName;
}

// The parent/child grammar avoids HTML parser repairs for this fixture: one
// main, headings/paragraphs/inline text, and dl -> keyed dt/dd rows only.
const childTags = {
	main: new Set(['h1', 'h2', 'p', 'pre', 'dl']),
	h1: new Set(['code', 'a']),
	h2: new Set(['code', 'a']),
	p: new Set(['code', 'a']),
	pre: new Set(),
	dt: new Set(['code']),
	dd: new Set(['code', 'a']),
	code: new Set(),
	a: new Set(),
	dl: new Set(['dt', 'dd']),
};

export function analyze(source, file = 'Landing.tsrx') {
	try {
		const ast = parseModule(source, file);
		const arrays = new Map();
		let component = null;
		for (const statement of ast.body) {
			if (statement.type === 'VariableDeclaration') {
				requireShape(
					statement.kind === 'const' && !statement.declare && statement.declarations.length === 1,
					'unsupported-declaration',
				);
				const declaration = statement.declarations[0];
				const binding = name(declaration.id);
				requireShape(
					binding &&
						dataLocals.has(binding) &&
						!arrays.has(binding) &&
						declaration.init?.type === 'ArrayExpression',
					'unsupported-binding',
				);
				const rows = declaration.init.elements;
				requireShape(Array.isArray(rows), 'nonliteral-rows');
				for (const row of rows) {
					requireShape(
						row?.type === 'ArrayExpression' && row.elements.length === 2,
						'nonliteral-rows',
					);
					for (const entry of row.elements)
						requireShape(entry?.type === 'Literal' && safeDataText(entry.value), 'nonliteral-rows');
				}
				const keys = rows.map((row) => row.elements[0].value);
				requireShape(new Set(keys).size === keys.length, 'duplicate-loop-key');
				arrays.set(binding, rows.length);
				continue;
			}
			requireShape(
				statement.type === 'ExportNamedDeclaration' &&
					statement.exportKind === 'value' &&
					!statement.source &&
					!component &&
					statement.specifiers?.length === 0,
				'unsupported-module',
			);
			const fn = statement.declaration;
			requireShape(
				fn?.type === 'FunctionDeclaration' &&
					name(fn.id) === 'Landing' &&
					!fn.declare &&
					!fn.abstract &&
					!fn.expression &&
					!fn.async &&
					!fn.generator &&
					fn.params.length === 0 &&
					!fn.typeParameters &&
					!fn.returnType &&
					fn.body?.type === 'JSXCodeBlock' &&
					fn.body.body.length === 0,
				'unsupported-component',
			);
			component = fn;
		}
		requireShape(component && arrays.size === dataLocals.size, 'missing-component-or-data');
		const root = component.body.render;
		requireShape(root?.type === 'JSXFragment' && root.children.length === 2, 'unsupported-root');
		style(root.children[0]);
		const used = new Set();
		const locals = new Set();
		function visitElement(element, parent, local = null) {
			requireShape(element?.type === 'JSXElement', 'unsupported-element');
			const tag = jsxName(element.openingElement?.name);
			requireShape(
				tag &&
					Object.hasOwn(childTags, tag) &&
					(!parent ? tag === 'main' : childTags[parent].has(tag)),
				'unsafe-nesting-or-tag',
			);
			requireShape(
				!element.openingElement.selfClosing && jsxName(element.closingElement?.name) === tag,
				'unsupported-element-shape',
			);
			const attributes = new Set();
			for (const attribute of element.openingElement.attributes) {
				const attributeName = literalAttribute(attribute, tag, source);
				requireShape(!attributes.has(attributeName), 'duplicate-attribute');
				attributes.add(attributeName);
			}
			requireShape(tag !== 'a' || attributes.has('href'), 'missing-link');
			// HTML discards an initial line feed in <pre>; admit only one plain,
			// control-free text child so it cannot silently change at parse time.
			if (tag === 'pre')
				requireShape(
					element.children.length === 1 &&
						text(element.children[0], source) &&
						safeDataText(element.children[0].value),
					'unsupported-pre-text',
				);
			for (const child of element.children) {
				if (text(child, source)) {
					requireShape(tag !== 'dl' || child.value.trim() === '', 'unsupported-dl-text');
					continue;
				}
				if (child?.type === 'JSXElement') {
					requireShape(tag !== 'dl', 'unsupported-direct-row');
					visitElement(child, tag, local);
					continue;
				}
				if (child?.type === 'JSXExpressionContainer') {
					const expression = child.expression;
					requireShape(
						local &&
							['code', 'dd'].includes(tag) &&
							expression?.type === 'TSAsExpression' &&
							expression.typeAnnotation?.type === 'TSStringKeyword' &&
							indexRead(expression.expression, local, [0, 1]),
						'unsupported-text-expression',
					);
					continue;
				}
				requireShape(
					tag === 'dl' && child?.type === 'JSXForExpression' && !local,
					'unsupported-child',
				);
				requireShape(
					child.await === false &&
						child.statementType === 'ForOfStatement' &&
						child.empty === null &&
						child.left?.type === 'VariableDeclaration' &&
						child.left.kind === 'const' &&
						child.left.declarations.length === 1,
					'unsupported-loop',
				);
				const decl = child.left.declarations[0];
				const binding = name(decl.id);
				const data = name(child.right);
				requireShape(
					binding &&
						!decl.init &&
						binding !== 'Landing' &&
						!arrays.has(binding) &&
						!locals.has(binding) &&
						data &&
						arrays.has(data) &&
						dataLocals.get(data) === binding &&
						!used.has(data) &&
						indexRead(child.key, binding, [0]),
					'unsafe-loop-binding',
				);
				locals.add(binding);
				used.add(data);
				const body = child.body;
				requireShape(
					body?.type === 'BlockStatement' &&
						body.body.length === 1 &&
						body.body[0]?.type === 'JSXFragment',
					'unsupported-loop-body',
				);
				const rows = body.body[0].children.filter(
					(node) => !text(node, source) || node.value.trim() !== '',
				);
				requireShape(
					rows.length === 2 &&
						jsxName(rows[0]?.openingElement?.name) === 'dt' &&
						jsxName(rows[1]?.openingElement?.name) === 'dd',
					'unsupported-loop-rows',
				);
				visitElement(rows[0], 'dl', binding);
				visitElement(rows[1], 'dl', binding);
			}
		}
		visitElement(root.children[1], null);
		requireShape(used.size === arrays.size, 'unused-data');
		for (const mode of ['client', 'server']) {
			const result = compile(source, file, { mode });
			requireShape(
				typeof result.code === 'string' && result.diagnostics?.length === 0,
				'compiler-rejected',
			);
		}
		return {
			accepted: true,
			component: 'Landing',
			arrays: arrays.size,
			rows: [...arrays.values()].reduce((a, b) => a + b, 0),
			cssSha256,
		};
	} catch (error) {
		return {
			accepted: false,
			reason: error instanceof Unsupported ? error.message : 'parse-or-analysis-error',
		};
	}
}
