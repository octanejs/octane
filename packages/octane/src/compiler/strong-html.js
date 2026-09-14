import { analyzeRendererBoundaries } from './renderer-boundaries.js';

export const STRONG_UNTRUSTED_HTML = 'OCTANE_STRONG_UNTRUSTED_HTML';
export const STRONG_HTML_MESSAGE =
	'Strong mode requires a TrustedHTML value for dangerouslySetInnerHTML. Use trustHTML() only for trusted or already sanitized HTML; trustHTML() does not sanitize its input.';
const SKIP_KEYS = new Set(['type', 'loc', 'start', 'end', 'range', 'metadata', 'parent']);
const TRANSPARENT = new Set([
	'ParenthesizedExpression',
	'TSAsExpression',
	'TSSatisfiesExpression',
	'TSTypeAssertion',
	'TSNonNullExpression',
	'TSInstantiationExpression',
]);

function unwrap(node) {
	while (node && TRANSPARENT.has(node.type)) node = node.expression;
	return node;
}

function propertyName(node) {
	return node?.type === 'Identifier' || node?.type === 'JSXIdentifier' ? node.name : node?.value;
}

export function checkStrongHTMLValue(expression, report) {
	const node = unwrap(expression);
	if (!node) return;
	switch (node.type) {
		case 'ObjectExpression':
			// A spread of an existing branded value retains its type. The type
			// checker verifies that value rather than rejecting all object syntax.
			if (!node.properties.some((property) => property.type === 'SpreadElement')) report(node);
			return;
		case 'Literal':
			if (node.value !== null) report(node);
			return;
		case 'TemplateLiteral':
		case 'ArrayExpression':
		case 'ArrowFunctionExpression':
		case 'FunctionExpression':
			report(node);
			return;
		case 'ConditionalExpression':
			checkStrongHTMLValue(node.consequent, report);
			checkStrongHTMLValue(node.alternate, report);
			return;
		case 'LogicalExpression':
			checkStrongHTMLValue(node.left, report);
			checkStrongHTMLValue(node.right, report);
			return;
		case 'SequenceExpression':
			checkStrongHTMLValue(node.expressions.at(-1), report);
	}
}
// Resolve only a statically visible final writer. An unknown later spread
// may replace an earlier raw value, so its actual type belongs to TypeScript.
export function strongHTMLSpreadWriter(expression) {
	const node = unwrap(expression);
	if (node?.type !== 'ObjectExpression') return undefined;
	for (let index = node.properties.length - 1; index >= 0; index--) {
		const property = node.properties[index];
		if (property.type === 'SpreadElement') {
			const writer = strongHTMLSpreadWriter(property.argument);
			if (writer !== null) return writer;
		} else if (property.type === 'Property') {
			if (property.computed && property.key.type !== 'Literal') return undefined;
			if (propertyName(property.key) === 'dangerouslySetInnerHTML')
				return property.kind === 'init' ? property.value : undefined;
		}
	}
	return null;
}

/**
 * A syntax-only compiler can reject visibly unbranded values. Imported values,
 * props, aliases and function results are checked by Strong's nominal JSX types
 * in Volar/tsrx-tsc; guessing their types here would reject valid trust boundaries.
 */
export function analyzeStrongHTML(ast, source, filename, options = {}) {
	if (!source.includes('dangerouslySetInnerHTML') && !source.includes('\\')) return [];
	const diagnostics = [];
	const reported = new WeakSet();
	const regions =
		options.rendererBoundaries && Object.keys(options.rendererBoundaries).length > 0
			? analyzeRendererBoundaries(source, {
					ast,
					filename,
					rendererBoundaries: options.rendererBoundaries,
				})
					.boundaries.map((boundary) => ({
						renderer: boundary.childRenderer,
						range: boundary.region?.range ?? boundary.region?.valueRange,
					}))
					.filter((region) => region.range != null)
			: [];
	function isDOM(node) {
		let renderer = options.renderer?.id ?? (options.dom === false ? null : 'dom');
		let width = Infinity;
		for (const region of regions) {
			const [start, end] = region.range;
			if (start <= node.start && node.end <= end && end - start < width) {
				renderer = region.renderer;
				width = end - start;
			}
		}
		return renderer === 'dom' || options.rendererRegistry?.[renderer]?.target === 'dom';
	}
	function report(node) {
		if (reported.has(node)) return;
		reported.add(node);
		const position = (edge) => ({
			offset: node[edge] ?? 0,
			line: node.loc?.[edge]?.line ?? 1,
			column: node.loc?.[edge]?.column ?? 0,
		});
		diagnostics.push({
			code: STRONG_UNTRUSTED_HTML,
			severity: 'error',
			filename,
			start: position('start'),
			end: position('end'),
			message: STRONG_HTML_MESSAGE,
			suggestions: [],
		});
	}
	function visit(node) {
		if (!node || typeof node !== 'object') return;
		if (Array.isArray(node)) {
			for (const item of node) visit(item);
			return;
		}
		if (
			node.type === 'JSXOpeningElement' &&
			node.name?.type === 'JSXIdentifier' &&
			/^[a-z]/.test(node.name.name) &&
			isDOM(node)
		) {
			for (let index = node.attributes.length - 1; index >= 0; index--) {
				const attribute = node.attributes[index];
				if (attribute.type === 'JSXSpreadAttribute') {
					const writer = strongHTMLSpreadWriter(attribute.argument);
					if (writer === null) continue;
					checkStrongHTMLValue(writer, report);
					break;
				} else if (propertyName(attribute.name) === 'dangerouslySetInnerHTML') {
					if (attribute.value?.type === 'JSXExpressionContainer')
						checkStrongHTMLValue(attribute.value.expression, report);
					else report(attribute.value ?? attribute);
					break;
				}
			}
		}
		for (const key of Object.keys(node)) if (!SKIP_KEYS.has(key)) visit(node[key]);
	}
	visit(ast);
	return diagnostics;
}
