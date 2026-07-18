import { nsForChildren, nsForSelf } from './jsx-namespace.js';
import { analyzeRendererBoundaries } from './renderer-boundaries.js';

export const NATIVE_TEXT_ONCHANGE_DIAGNOSTIC = 'OCTANE_NATIVE_TEXT_ONCHANGE';

const TEXT_ENTRY_TYPES = new Set(['email', 'number', 'password', 'search', 'tel', 'text', 'url']);

// Every currently standardized non-text input state. A string outside both
// tables takes HTML's invalid-value default and is therefore the text state.
const NON_TEXT_INPUT_TYPES = new Set([
	'button',
	'checkbox',
	'color',
	'date',
	'datetime-local',
	'file',
	'hidden',
	'image',
	'month',
	'radio',
	'range',
	'reset',
	'submit',
	'time',
	'week',
]);

const SKIP_KEYS = new Set(['type', 'loc', 'start', 'end', 'range', 'metadata', 'parent']);
const FUNCTION_TYPES = new Set([
	'ArrowFunctionExpression',
	'FunctionDeclaration',
	'FunctionExpression',
]);
const TRANSPARENT_EXPRESSIONS = new Set([
	'ParenthesizedExpression',
	'TSAsExpression',
	'TSInstantiationExpression',
	'TSNonNullExpression',
	'TSSatisfiesExpression',
	'TSTypeAssertion',
]);

function unwrapExpression(node) {
	let current = node;
	while (current && TRANSPARENT_EXPRESSIONS.has(current.type)) {
		current = current.expression;
	}
	return current;
}

function declarationOf(statement) {
	if (
		statement?.type === 'ExportNamedDeclaration' ||
		statement?.type === 'ExportDefaultDeclaration'
	) {
		return statement.declaration;
	}
	return statement;
}

function addPatternBindings(pattern, value, bindings) {
	if (!pattern) return;
	if (pattern.type === 'Identifier' || pattern.type === 'JSXIdentifier') {
		bindings.set(pattern.name, value);
		return;
	}
	if (pattern.type === 'RestElement') {
		addPatternBindings(pattern.argument, value, bindings);
		return;
	}
	if (pattern.type === 'AssignmentPattern') {
		addPatternBindings(pattern.left, value, bindings);
		return;
	}
	if (pattern.type === 'ArrayPattern') {
		for (const element of pattern.elements ?? []) addPatternBindings(element, value, bindings);
		return;
	}
	if (pattern.type === 'ObjectPattern') {
		for (const property of pattern.properties ?? []) {
			addPatternBindings(property.argument ?? property.value, value, bindings);
		}
	}
}

function collectDirectBindings(statements, bindings) {
	for (const statement of Array.isArray(statements) ? statements : []) {
		if (statement?.type === 'ImportDeclaration') {
			for (const specifier of statement.specifiers ?? []) {
				if (specifier.local?.name) bindings.set(specifier.local.name, 'other');
			}
			continue;
		}
		const declaration = declarationOf(statement);
		if (declaration?.type === 'FunctionDeclaration') {
			// Function declarations are writable bindings. Without a mutation pass,
			// treating them as permanently callable can suppress the runtime check
			// after a later assignment; keep them unresolved. A const initialized
			// directly with a function is the only binding shape proven immutable.
			if (declaration.id?.name) bindings.set(declaration.id.name, 'other');
			continue;
		}
		if (declaration?.type === 'ClassDeclaration') {
			if (declaration.id?.name) bindings.set(declaration.id.name, 'other');
			continue;
		}
		if (declaration?.type !== 'VariableDeclaration') continue;
		for (const item of declaration.declarations ?? []) {
			const initial = unwrapExpression(item.init);
			const simpleBinding = item.id?.type === 'Identifier' || item.id?.type === 'JSXIdentifier';
			addPatternBindings(
				item.id,
				declaration.kind === 'const' && simpleBinding && initial && FUNCTION_TYPES.has(initial.type)
					? 'callable'
					: 'other',
				bindings,
			);
		}
	}
}

function createScope(parent, statements, params = []) {
	const bindings = new Map();
	collectDirectBindings(statements, bindings);
	for (const param of Array.isArray(params) ? params : []) {
		addPatternBindings(param, 'other', bindings);
	}
	return { parent, bindings };
}

function resolvesCallable(scope, name) {
	for (let current = scope; current; current = current.parent) {
		if (current.bindings.has(name)) return current.bindings.get(name) === 'callable';
	}
	return false;
}

function nodeName(node) {
	if (node?.type === 'JSXIdentifier' || node?.type === 'Identifier') return node.name;
	if (typeof node === 'string') return node;
	return null;
}

function tagName(node) {
	return nodeName(node?.openingElement?.name ?? node?.id);
}

function attributesOf(node) {
	return node?.openingElement?.attributes ?? node?.attributes ?? [];
}

function attributeName(attribute) {
	return nodeName(attribute?.name);
}

function attributeExpression(attribute) {
	if (attribute?.value == null) return { type: 'Literal', value: true };
	return unwrapExpression(
		attribute.value.type === 'JSXExpressionContainer'
			? attribute.value.expression
			: attribute.value,
	);
}

function lastAttribute(attributes, name) {
	for (let index = attributes.length - 1; index >= 0; index--) {
		const attribute = attributes[index];
		if (
			(attribute.type === 'Attribute' || attribute.type === 'JSXAttribute') &&
			attributeName(attribute) === name
		) {
			return attribute;
		}
	}
	return null;
}

function literalValue(expression) {
	if (expression?.type === 'Literal' || expression?.type === 'StringLiteral') {
		return { known: true, value: expression.value };
	}
	if (expression?.type === 'TemplateLiteral' && expression.expressions?.length === 0) {
		return { known: true, value: expression.quasis?.[0]?.value?.cooked ?? '' };
	}
	if (expression?.type === 'Identifier' && expression.name === 'undefined') {
		return { known: true, value: undefined };
	}
	if (expression?.type === 'UnaryExpression' && expression.operator === 'void') {
		return { known: true, value: undefined };
	}
	return { known: false, value: undefined };
}

function eventPresence(attribute, scope, requireProvenCallable) {
	if (attribute === null) return 'absent';
	const expression = attributeExpression(attribute);
	const literal = literalValue(expression);
	if (literal.known) return 'absent';
	if (FUNCTION_TYPES.has(expression?.type)) return 'callable';
	if (expression?.type === 'Identifier' && resolvesCallable(scope, expression.name)) {
		return 'callable';
	}
	return requireProvenCallable ? 'unresolved' : 'present';
}

function booleanIntent(attribute) {
	if (attribute === null) return 'false';
	const literal = literalValue(attributeExpression(attribute));
	if (!literal.known) return 'dynamic';
	return literal.value === true ? 'true' : 'false';
}

function htmlBooleanState(attribute) {
	if (attribute === null) return 'false';
	const literal = literalValue(attributeExpression(attribute));
	if (!literal.known) return 'dynamic';
	// Match Octane's host boolean-property truthiness. Empty strings, zero,
	// false, and nullish values are absent; non-empty strings (including the
	// HTML spelling disabled="disabled") and true enable the property.
	return literal.value ? 'true' : 'false';
}

function inputTypeState(attribute) {
	if (attribute === null) return { kind: 'text', display: 'text' };
	if (attribute.value == null) return { kind: 'text', display: 'text' };
	const literal = literalValue(attributeExpression(attribute));
	if (!literal.known) return { kind: 'dynamic' };
	if (typeof literal.value !== 'string') return { kind: 'text', display: 'text' };
	const normalized = literal.value.toLowerCase();
	if (normalized === '' || TEXT_ENTRY_TYPES.has(normalized)) {
		return { kind: 'text', display: normalized || 'text' };
	}
	if (NON_TEXT_INPUT_TYPES.has(normalized)) return { kind: 'non-text', display: normalized };
	return { kind: 'text', display: normalized };
}

function positionAt(source, offset) {
	let line = 1;
	let column = 0;
	for (let index = 0; index < offset; index++) {
		if (source.charCodeAt(index) === 10) {
			line++;
			column = 0;
		} else {
			column++;
		}
	}
	return { offset, line, column };
}

function rangeFor(source, node) {
	const startOffset = node?.start ?? 0;
	const endOffset = node?.end ?? startOffset;
	return {
		start: positionAt(source, startOffset),
		end: positionAt(source, endOffset),
	};
}

function hostLabel(tag, type) {
	return tag === 'textarea' ? '<textarea>' : `<input type="${type.display}">`;
}

function diagnosticFor(source, filename, tag, type, changeAttributes, controlled) {
	const first = changeAttributes[0];
	const captureOnly = attributeName(first) === 'onChangeCapture';
	const replacement = captureOnly ? 'onInputCapture' : 'onInput';
	let message =
		`[${NATIVE_TEXT_ONCHANGE_DIAGNOSTIC}] \`${attributeName(first)}\` on ${hostLabel(tag, type)} ` +
		`is a native commit event in Octane; it does not run for each text edit. Use \`${replacement}\` ` +
		'for per-edit updates. If commit/blur behavior is intentional, add ' +
		'`suppressNativeChangeWarning`.';
	if (controlled) {
		message +=
			' This control also has `value`; edits are restored before the later native change. ' +
			'Use `defaultValue` for editable commit-only behavior.';
	}
	const primary = rangeFor(source, first.name ?? first);
	return {
		code: NATIVE_TEXT_ONCHANGE_DIAGNOSTIC,
		severity: 'warning',
		message,
		filename: filename || 'module.tsrx',
		start: primary.start,
		end: primary.end,
		suggestions: changeAttributes.map((attribute) => {
			const range = rangeFor(source, attribute.name ?? attribute);
			return {
				...range,
				attribute: attributeName(attribute) === 'onChangeCapture' ? 'onInputCapture' : 'onInput',
			};
		}),
	};
}

function classifyHost(node, scope, namespace, source, filename, diagnostics, classifications) {
	const tag = tagName(node);
	if ((tag !== 'input' && tag !== 'textarea') || namespace !== 'html') return;
	const attributes = attributesOf(node);
	const classificationKey = node.start ?? node.openingElement?.start;
	const setClassification = (kind) => {
		if (classificationKey !== undefined) classifications.set(classificationKey, kind);
	};
	if (
		attributes.some(
			(attribute) =>
				attribute.type === 'SpreadAttribute' || attribute.type === 'JSXSpreadAttribute',
		)
	) {
		setClassification('runtime-check');
		return;
	}

	const changeAttributes = ['onChange', 'onChangeCapture']
		.map((name) => lastAttribute(attributes, name))
		.filter((attribute) => eventPresence(attribute, scope, false) !== 'absent')
		.sort((left, right) => left.start - right.start);
	if (changeAttributes.length === 0) {
		setClassification('safe');
		return;
	}

	const type = tag === 'input' ? inputTypeState(lastAttribute(attributes, 'type')) : null;
	if (type?.kind === 'non-text') {
		setClassification('safe');
		return;
	}
	if (type?.kind === 'dynamic') {
		setClassification('runtime-check');
		return;
	}

	const readOnly = htmlBooleanState(lastAttribute(attributes, 'readOnly'));
	const disabled = htmlBooleanState(lastAttribute(attributes, 'disabled'));
	const suppression = booleanIntent(lastAttribute(attributes, 'suppressNativeChangeWarning'));
	if (readOnly === 'true' || disabled === 'true' || suppression === 'true') {
		setClassification('safe');
		return;
	}
	if (readOnly === 'dynamic' || disabled === 'dynamic' || suppression === 'dynamic') {
		setClassification('runtime-check');
		return;
	}

	const inputStates = ['onInput', 'onInputCapture'].map((name) =>
		eventPresence(lastAttribute(attributes, name), scope, true),
	);
	if (inputStates.includes('callable')) {
		setClassification('safe');
		return;
	}
	if (inputStates.includes('unresolved')) {
		setClassification('runtime-check');
		return;
	}

	setClassification('statically-warned');
	diagnostics.push(
		diagnosticFor(
			source,
			filename,
			tag,
			type ?? { kind: 'text', display: 'text' },
			changeAttributes,
			lastAttribute(attributes, 'value') !== null,
		),
	);
}

/**
 * Analyze authored JSX once, before lowering mutates its shape. The returned
 * start-offset classifications are also consumed by development codegen to
 * dedupe static warnings and arm only ambiguous direct-host sites.
 */
export function analyzeNativeChangeDiagnostics(ast, source, filename, options = {}) {
	const diagnostics = [];
	const classifications = new Map();
	const ownerRendererId = options.renderer?.id ?? (options.dom === false ? null : 'dom');
	let rendererRegions = [];
	if (options.rendererBoundaries && Object.keys(options.rendererBoundaries).length > 0) {
		rendererRegions = analyzeRendererBoundaries(source, {
			filename,
			rendererBoundaries: options.rendererBoundaries,
		})
			.boundaries.map((boundary) => ({
				childRenderer: boundary.childRenderer,
				range: boundary.region?.range ?? boundary.region?.valueRange,
			}))
			.filter((region) => region.range !== null);
	}
	const rendererIsDomAt = (node) => {
		let rendererId = ownerRendererId;
		let narrowest = Number.POSITIVE_INFINITY;
		for (const region of rendererRegions) {
			const [start, end] = region.range;
			if (start > node.start || node.end > end) continue;
			const width = end - start;
			if (width < narrowest) {
				rendererId = region.childRenderer;
				narrowest = width;
			}
		}
		if (rendererId === 'dom') return true;
		return options.rendererRegistry?.[rendererId]?.target === 'dom';
	};

	const programScope = createScope(null, ast?.body ?? []);
	const seen = new WeakSet();

	const visit = (node, scope, jsxParentNs = 'html') => {
		if (node == null || typeof node !== 'object') return;
		if (Array.isArray(node)) {
			for (const child of node) visit(child, scope, jsxParentNs);
			return;
		}
		if (seen.has(node)) return;
		seen.add(node);

		if (node.type === 'JSXElement' || node.type === 'Element') {
			visitElement(node, scope, jsxParentNs);
			return;
		}
		if (node.type === 'JSXFragment' || node.type === 'Fragment') {
			for (const child of node.children ?? []) visit(child, scope, jsxParentNs);
			return;
		}
		if (
			node.type === 'FunctionDeclaration' ||
			node.type === 'FunctionExpression' ||
			node.type === 'ArrowFunctionExpression'
		) {
			const bodyStatements = Array.isArray(node.body?.body) ? node.body.body : [];
			const functionScope = createScope(scope, bodyStatements, node.params ?? []);
			if (node.id?.name) functionScope.bindings.set(node.id.name, 'callable');
			visit(node.body, functionScope, jsxParentNs);
			return;
		}
		if (node.type === 'BlockStatement' || node.type === 'JSXCodeBlock') {
			const statements = Array.isArray(node.body) ? node.body : [];
			const blockScope = createScope(scope, statements);
			for (const statement of statements) visit(statement, blockScope, jsxParentNs);
			if (node.render) visit(node.render, blockScope, jsxParentNs);
			return;
		}
		if (node.type === 'CatchClause') {
			const catchScope = createScope(scope, [], node.param ? [node.param] : []);
			visit(node.body, catchScope, jsxParentNs);
			return;
		}
		if (
			node.type === 'ForStatement' ||
			node.type === 'ForInStatement' ||
			node.type === 'ForOfStatement'
		) {
			const declaration = node.type === 'ForStatement' ? node.init : node.left;
			const loopScope = createScope(
				scope,
				declaration?.type === 'VariableDeclaration' ? [declaration] : [],
			);
			visit(declaration, loopScope, jsxParentNs);
			visit(node.test, loopScope, jsxParentNs);
			visit(node.update, loopScope, jsxParentNs);
			visit(node.right, loopScope, jsxParentNs);
			visit(node.body, loopScope, jsxParentNs);
			return;
		}
		for (const [key, value] of Object.entries(node)) {
			if (SKIP_KEYS.has(key)) continue;
			visit(value, scope, jsxParentNs);
		}
	};

	const visitElement = (node, scope, parentNs) => {
		const tag = tagName(node);
		const isHost = typeof tag === 'string' && /^[a-z]/.test(tag);
		const selfNs = isHost ? nsForSelf(tag, parentNs) : parentNs;
		if (isHost && rendererIsDomAt(node)) {
			classifyHost(node, scope, selfNs, source, filename, diagnostics, classifications);
		}

		for (const attribute of attributesOf(node)) {
			if (attribute.type === 'SpreadAttribute' || attribute.type === 'JSXSpreadAttribute') {
				visit(attribute.argument, scope, parentNs);
			} else if (attribute.value?.type === 'JSXExpressionContainer') {
				visit(attribute.value.expression, scope, parentNs);
			}
		}
		// Component children retain their lexical namespace. They may be moved by
		// the component at runtime, but the final-props fallback owns that case;
		// preserving the parent here keeps transparent DOM boundaries such as
		// <Hydrate> statically diagnosable without assuming HTML below SVG.
		const childNs = isHost ? nsForChildren(tag, selfNs) : parentNs;
		for (const child of node.children ?? []) visit(child, scope, childNs);
	};

	visit(ast, programScope, 'html');
	diagnostics.sort((left, right) => left.start.offset - right.start.offset);
	return { diagnostics, classifications };
}

export function formatCompileDiagnostic(diagnostic) {
	return `${diagnostic.filename}:${diagnostic.start.line}:${diagnostic.start.column + 1} ${diagnostic.message}`;
}
