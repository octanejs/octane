import { builders as b } from '@tsrx/core';
import { createLexicalAnalysis } from './compile-universal.js';

const SKIP_KEYS = new Set(['type', 'loc', 'start', 'end', 'range', 'metadata', 'parent', 'css']);

function unwrapExpression(node) {
	while (
		node?.type === 'TSAsExpression' ||
		node?.type === 'TSTypeAssertion' ||
		node?.type === 'TSNonNullExpression' ||
		node?.type === 'TSSatisfiesExpression' ||
		node?.type === 'ParenthesizedExpression'
	) {
		node = node.expression;
	}
	return node;
}

function memberName(node) {
	if (node?.type !== 'MemberExpression' || node.optional) return undefined;
	if (!node.computed && node.property?.type === 'Identifier') return node.property.name;
	if (
		node.computed &&
		(node.property?.type === 'Literal' || node.property?.type === 'StringLiteral') &&
		typeof node.property.value === 'string'
	) {
		return node.property.value;
	}
	return undefined;
}

function isClassAttribute(node) {
	return (
		node?.type === 'JSXAttribute' &&
		node.name?.type === 'JSXIdentifier' &&
		(node.name.name === 'class' || node.name.name === 'className') &&
		node.value?.type === 'JSXExpressionContainer'
	);
}

// These nodes have separate ownership, namespace, raw-text, or parser-repair
// behavior. Do not borrow a stylesheet witness across one of those boundaries.
const SEPARATE_HOSTS = new Set([
	'head',
	'html',
	'body',
	'script',
	'style',
	'textarea',
	'title',
	'meta',
	'link',
	'option',
	'select',
	'pre',
	'listing',
	'noscript',
	'template',
	'svg',
	'math',
	'foreignObject',
	'annotation-xml',
]);
const OPAQUE_CONTENT_HOSTS = new Set([
	'script',
	'style',
	'textarea',
	'title',
	'option',
	'noscript',
	'template',
	'svg',
	'math',
]);

/**
 * Bake only complete, side-effect-free class strings whose imported values the
 * host has proved initialized and immutable. A CSS filename or a read-only use
 * in this module is not that proof: ordinary CSS-module default maps are mutable
 * and may be changed by another importer. The resolver owns that module-graph
 * contract, including stylesheet side effects; this pass retains every import.
 *
 * Run before template planning so the existing client/SSR static-attribute
 * writers still own escaping, class composition, spreads, and hydration. No
 * generated JavaScript is reparsed or changed after printing.
 */
export function applyCssModuleConstants(ast, resolveConstant, preserveReferences) {
	if (typeof resolveConstant !== 'function') return { ast, imports: [] };
	if (
		preserveReferences !== undefined &&
		(!Array.isArray(preserveReferences) ||
			preserveReferences.some((request) => typeof request !== 'string'))
	) {
		throw new TypeError('preserveCssModuleReferences must be an array of module requests.');
	}
	const preserve = new Set(preserveReferences);
	const imports = new Map();
	for (const statement of ast.body ?? []) {
		if (
			statement.type !== 'ImportDeclaration' ||
			statement.importKind === 'type' ||
			statement.attributes?.length > 0 ||
			statement.assertions?.length > 0
		) {
			continue;
		}
		const request = statement.source?.value;
		if (typeof request !== 'string') continue;
		for (const specifier of statement.specifiers ?? []) {
			if (specifier.importKind === 'type' || specifier.local?.type !== 'Identifier') continue;
			const imported =
				specifier.type === 'ImportDefaultSpecifier'
					? 'default'
					: specifier.type === 'ImportNamespaceSpecifier'
						? '*'
						: (specifier.imported?.name ?? specifier.imported?.value);
			if (typeof imported === 'string') {
				imports.set(specifier.local.name, { request, imported, source: statement.source });
			}
		}
	}
	if (imports.size === 0) return { ast, imports: [] };

	const lexical = createLexicalAnalysis(ast);
	const values = new Map();
	const usedImports = new Set();
	const importValue = (node, property) => {
		if (node?.type !== 'Identifier') return undefined;
		const imported = imports.get(node.name);
		if (imported === undefined) return undefined;
		const binding = lexical.resolveBinding(
			lexical.nodeScopes.get(node) ?? lexical.rootScope,
			node.name,
		);
		if (binding?.importSource !== imported.source) return undefined;
		const key = JSON.stringify([imported.request, imported.imported, property]);
		if (!values.has(key)) {
			const value = resolveConstant(imported.request, imported.imported, property);
			if (value !== undefined && typeof value !== 'string') {
				throw new Error(
					`Invalid CSS-module constant for ${JSON.stringify(imported.request)}: expected a string or undefined.`,
				);
			}
			values.set(key, value);
		}
		const value = values.get(key);
		return value === undefined ? undefined : { value, imports: [imported.request] };
	};

	const stringValue = (expression) => {
		const node = unwrapExpression(expression);
		if (
			(node?.type === 'Literal' || node?.type === 'StringLiteral') &&
			typeof node.value === 'string'
		) {
			return { value: node.value, imports: [] };
		}
		if (node?.type === 'Identifier') return importValue(node, null);
		const property = memberName(node);
		if (property !== undefined) return importValue(unwrapExpression(node.object), property);
		if (node?.type === 'BinaryExpression' && node.operator === '+') {
			const left = stringValue(node.left);
			if (left === undefined) return undefined;
			const right = stringValue(node.right);
			if (right === undefined) return undefined;
			return { value: left.value + right.value, imports: [...left.imports, ...right.imports] };
		}
		if (node?.type === 'TemplateLiteral') {
			let value = node.quasis[0]?.value?.cooked;
			if (typeof value !== 'string') return undefined;
			const imports = [];
			for (let i = 0; i < node.expressions.length; i++) {
				const part = stringValue(node.expressions[i]);
				const tail = node.quasis[i + 1]?.value?.cooked;
				if (part === undefined || typeof tail !== 'string') return undefined;
				value += part.value + tail;
				imports.push(...part.imports);
			}
			return { value, imports };
		}
		return undefined;
	};

	// Vite emits a CSS module's stylesheet only while one of its exports is
	// retained. A global side-effect override would make styles belonging to a
	// dropped component eager. Instead retain one ORIGINAL class read for each
	// stylesheet in each contiguous static host tree. Components, directives,
	// expression branches, and separate roots cannot borrow each other's witness.
	// The witness has one class prop and no spread, so source-order/duplicate-prop
	// lowering cannot discard it. Callers that own CSS emission independently can
	// omit this option and bake every proven string.
	const groups = [];
	const newGroup = () => {
		const group = { candidates: [], witnessed: new Set(), retained: new Set() };
		groups.push(group);
		return group;
	};
	const seen = new WeakSet();
	const collect = (node, inheritedGroup = null) => {
		if (node === null || typeof node !== 'object' || seen.has(node)) return;
		seen.add(node);
		if (Array.isArray(node)) {
			for (const child of node) collect(child);
			return;
		}
		if (node.type === 'JSXElement' || node.type === 'Element') {
			const tag = node.openingElement?.name ?? node.id ?? node.name;
			const name = tag?.type === 'JSXIdentifier' || tag?.type === 'Identifier' ? tag.name : null;
			const attributes = node.openingElement?.attributes ?? node.attributes ?? [];
			const ordinary = typeof name === 'string' && /^[a-z][A-Za-z0-9]*$/.test(name);
			const separate = SEPARATE_HOSTS.has(name);
			const customized =
				(typeof name === 'string' && name.includes('-')) ||
				attributes.some((attribute) => attribute.name?.name === 'is');
			const hasSpread = attributes.some((attribute) => attribute.type === 'JSXSpreadAttribute');
			const ownsContent = attributes.some((attribute) =>
				['dangerouslySetInnerHTML', 'innerHTML', 'textContent'].includes(attribute.name?.name),
			);
			const group =
				ordinary && !separate && !customized ? (inheritedGroup ?? newGroup()) : newGroup();
			const classAttributes = attributes.filter(
				(attribute) =>
					attribute.type === 'JSXAttribute' &&
					(attribute.name?.name === 'class' || attribute.name?.name === 'className'),
			);
			const canWitness =
				ordinary && !separate && !customized && !hasSpread && classAttributes.length === 1;
			for (const attribute of attributes) {
				if (!customized && !separate && isClassAttribute(attribute)) {
					const constant = stringValue(attribute.value.expression);
					if (constant !== undefined && constant.imports.length > 0) {
						group.candidates.push({ attribute, constant, canWitness });
					}
				}
				// A JSX-valued prop/render function owns a separate template.
				collect(attribute.value?.expression ?? attribute.argument);
			}
			if (!ownsContent && !OPAQUE_CONTENT_HOSTS.has(name)) {
				const childGroup = ordinary && !separate && !customized && !hasSpread ? group : null;
				for (const child of node.children ?? []) collect(child, childGroup);
			}
			return;
		}
		if (node.type === 'JSXFragment' || node.type === 'Fragment') {
			for (const child of node.children ?? []) collect(child, inheritedGroup);
			return;
		}
		for (const key of Object.keys(node)) {
			if (!SKIP_KEYS.has(key)) collect(node[key]);
		}
	};
	collect(ast);
	const replacements = new WeakMap();
	for (const group of groups) {
		for (const { attribute, constant, canWitness } of group.candidates) {
			if (
				canWitness &&
				constant.imports.some((request) => preserve.has(request) && !group.witnessed.has(request))
			) {
				group.retained.add(attribute);
				for (const request of constant.imports) group.witnessed.add(request);
			}
		}
		for (const { attribute, constant } of group.candidates) {
			if (
				group.retained.has(attribute) ||
				constant.imports.some((request) => preserve.has(request) && !group.witnessed.has(request))
			) {
				continue;
			}
			for (const request of constant.imports) usedImports.add(request);
			replacements.set(attribute, {
				...attribute,
				value: {
					...attribute.value,
					expression: b.literal(
						constant.value,
						JSON.stringify(constant.value),
						attribute.value.expression,
					),
				},
			});
		}
	}
	if (usedImports.size === 0) return { ast, imports: [] };

	const rewritten = new WeakMap();
	const visit = (node) => {
		if (node === null || typeof node !== 'object') return node;
		if (rewritten.has(node)) return rewritten.get(node);
		rewritten.set(node, node);
		if (Array.isArray(node)) {
			let next = null;
			for (let i = 0; i < node.length; i++) {
				const child = visit(node[i]);
				if (next === null && child !== node[i]) next = node.slice(0, i);
				if (next !== null) next.push(child);
			}
			const result = next ?? node;
			rewritten.set(node, result);
			return result;
		}
		if (typeof node.type !== 'string') return node;
		const replacement = replacements.get(node);
		if (replacement !== undefined) {
			rewritten.set(node, replacement);
			return replacement;
		}
		let next = null;
		for (const key of Object.keys(node)) {
			if (SKIP_KEYS.has(key)) continue;
			const child = visit(node[key]);
			if (child !== node[key]) {
				next ??= { ...node };
				next[key] = child;
			}
		}
		const result = next ?? node;
		rewritten.set(node, result);
		return result;
	};
	const result = visit(ast);
	return { ast: result, imports: [...usedImports] };
}
