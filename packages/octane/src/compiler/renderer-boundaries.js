/**
 * Static renderer-boundary analysis.
 *
 * Boundary ownership is package metadata, not a property discovered from a
 * component value at runtime. This pass resolves that metadata through ESM
 * imports and returns source ranges that a mixed-renderer lowering pass can
 * replace without guessing from JSX ancestry.
 */
import { parseModule } from '@tsrx/core';

const TRANSPARENT_TS_EXPRESSIONS = new Set([
	'ParenthesizedExpression',
	'TSAsExpression',
	'TSInstantiationExpression',
	'TSNonNullExpression',
	'TSSatisfiesExpression',
	'TSTypeAssertion',
]);

function range(node, fallback = 0) {
	return Object.freeze([node?.start ?? fallback, node?.end ?? fallback]);
}

function nameOf(node) {
	if (node?.type === 'Identifier' || node?.type === 'JSXIdentifier') return node.name;
	if (node?.type === 'Literal' && typeof node.value === 'string') return node.value;
	return null;
}

function collectBindings(pattern, bindings) {
	if (!pattern) return;
	switch (pattern.type) {
		case 'Identifier':
			bindings.add(pattern.name);
			return;
		case 'ObjectPattern':
			for (const property of pattern.properties ?? []) {
				if (property.type === 'RestElement') collectBindings(property.argument, bindings);
				else collectBindings(property.value ?? property.key, bindings);
			}
			return;
		case 'ArrayPattern':
			for (const element of pattern.elements ?? []) collectBindings(element, bindings);
			return;
		case 'AssignmentPattern':
			collectBindings(pattern.left, bindings);
			return;
		case 'RestElement':
			collectBindings(pattern.argument, bindings);
	}
}

function addRelevantBindings(pattern, shadowed, importNames) {
	const bindings = new Set();
	collectBindings(pattern, bindings);
	for (const binding of bindings) {
		if (importNames.has(binding)) shadowed.add(binding);
	}
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

function addDirectScopeBindings(statements, shadowed, importNames) {
	for (const statement of statements ?? []) {
		const declaration = directDeclaration(statement);
		if (declaration?.type === 'VariableDeclaration') {
			for (const item of declaration.declarations ?? []) {
				addRelevantBindings(item.id, shadowed, importNames);
			}
		} else if (
			(declaration?.type === 'FunctionDeclaration' ||
				declaration?.type === 'ClassDeclaration' ||
				declaration?.type === 'TSEnumDeclaration') &&
			declaration.id
		) {
			addRelevantBindings(declaration.id, shadowed, importNames);
		}
	}
}

function collectFunctionVarBindings(node, shadowed, importNames) {
	if (node == null || typeof node !== 'object') return;
	if (Array.isArray(node)) {
		for (const child of node) collectFunctionVarBindings(child, shadowed, importNames);
		return;
	}
	if (
		node.type === 'FunctionDeclaration' ||
		node.type === 'FunctionExpression' ||
		node.type === 'ArrowFunctionExpression'
	) {
		return;
	}
	if (node.type === 'VariableDeclaration' && node.kind === 'var') {
		for (const declaration of node.declarations ?? []) {
			addRelevantBindings(declaration.id, shadowed, importNames);
		}
	}
	for (const [key, value] of Object.entries(node)) {
		if (key === 'loc' || key === 'start' || key === 'end' || key === 'metadata') continue;
		collectFunctionVarBindings(value, shadowed, importNames);
	}
}

function collectImports(ast, rendererBoundaries) {
	const direct = new Map();
	const namespaces = new Map();
	for (const statement of ast.body ?? []) {
		if (statement.type !== 'ImportDeclaration' || statement.importKind === 'type') continue;
		const moduleId = statement.source?.value;
		const moduleBoundaries = rendererBoundaries?.[moduleId];
		if (!moduleBoundaries) continue;

		for (const specifier of statement.specifiers ?? []) {
			if (specifier.importKind === 'type') continue;
			const local = specifier.local?.name;
			if (!local) continue;
			if (specifier.type === 'ImportNamespaceSpecifier') {
				namespaces.set(local, { moduleId, exports: moduleBoundaries });
				continue;
			}
			const exportName =
				specifier.type === 'ImportDefaultSpecifier' ? 'default' : nameOf(specifier.imported);
			const metadata = exportName == null ? null : moduleBoundaries[exportName];
			if (metadata) direct.set(local, { exportName, metadata, moduleId });
		}
	}
	return { direct, namespaces };
}

function resolveTag(node, imports, shadowed) {
	const tag = node.openingElement?.name ?? node.name;
	if (tag?.type === 'JSXIdentifier' || tag?.type === 'Identifier') {
		if (shadowed.has(tag.name)) return null;
		const binding = imports.direct.get(tag.name);
		return binding ? { ...binding, local: tag.name, referenceKind: 'binding', tag } : null;
	}
	if (tag?.type !== 'JSXMemberExpression' && tag?.type !== 'MemberExpression') return null;
	if (tag.computed || !tag.object || !tag.property) return null;
	const namespaceName = nameOf(tag.object);
	const exportName = nameOf(tag.property);
	if (!namespaceName || !exportName || shadowed.has(namespaceName)) return null;
	const namespace = imports.namespaces.get(namespaceName);
	const metadata = namespace?.exports?.[exportName];
	if (!metadata) return null;
	return {
		exportName,
		local: namespaceName,
		metadata,
		moduleId: namespace.moduleId,
		referenceKind: 'namespace',
		tag,
	};
}

function attributeName(attribute) {
	if (attribute?.type !== 'JSXAttribute' && attribute?.type !== 'Attribute') return null;
	return nameOf(attribute.name);
}

function isRenderableChild(child) {
	if (!child) return false;
	if (child.type === 'JSXText') return !/^\s*$/.test(child.value ?? '');
	if (child.type === 'JSXExpressionContainer') {
		return child.expression != null && child.expression.type !== 'JSXEmptyExpression';
	}
	return child.type !== 'JSXStyleElement';
}

function attributeRegion(attribute) {
	const value = attribute.value;
	if (!value) {
		return Object.freeze({
			kind: 'attribute',
			attributeRange: range(attribute),
			valueKind: 'boolean',
			valueRange: null,
			value: true,
		});
	}
	const expression =
		value.type === 'JSXExpressionContainer' && value.expression?.type !== 'JSXEmptyExpression'
			? value.expression
			: null;
	return Object.freeze({
		kind: 'attribute',
		attributeRange: range(attribute),
		valueKind: expression ? 'expression' : 'literal',
		valueRange: range(expression ?? value),
		...(expression ? null : { value: value.value }),
	});
}

function diagnostic(filename, node, moduleId, exportName, prop, reason) {
	const start = node?.loc?.start;
	const at = start ? `${filename}:${start.line}:${start.column}` : filename;
	return Object.freeze({
		code: 'OCTANE_RENDERER_BOUNDARY_AMBIGUOUS_SPREAD',
		severity: 'error',
		filename,
		message:
			`Renderer boundary ${JSON.stringify(`${moduleId}#${exportName}`)} cannot determine its ` +
			`${JSON.stringify(prop)} region because ${reason}. Declare ${JSON.stringify(prop)} ` +
			`after the spread or provide it as JSX children. (${at})`,
		range: range(node),
		loc: start ? Object.freeze({ column: start.column, line: start.line }) : null,
	});
}

function resolveRegion(node, match, filename, diagnostics) {
	const prop = match.metadata.prop;
	const opening = node.openingElement ?? node;
	const attributes = opening.attributes ?? node.attributes ?? [];
	const explicit = [];
	const spreads = [];
	for (let index = 0; index < attributes.length; index++) {
		const attribute = attributes[index];
		if (attribute.type === 'JSXSpreadAttribute' || attribute.type === 'SpreadAttribute') {
			spreads.push({ attribute, index });
		} else if (attributeName(attribute) === prop) {
			explicit.push({ attribute, index });
		}
	}

	const hasChildren = (node.children ?? []).some(isRenderableChild);
	if (prop === 'children' && hasChildren) {
		const end = node.closingElement?.start ?? opening.end;
		return Object.freeze({ kind: 'children', range: range({ start: opening.end, end }) });
	}

	const selected = explicit.at(-1);
	if (selected) {
		const overridingSpread = spreads.find(({ index }) => index > selected.index);
		if (overridingSpread) {
			diagnostics.push(
				diagnostic(
					filename,
					overridingSpread.attribute,
					match.moduleId,
					match.exportName,
					prop,
					'a later spread may replace the explicit prop',
				),
			);
		}
		return attributeRegion(selected.attribute);
	}

	if (spreads.length > 0) {
		diagnostics.push(
			diagnostic(
				filename,
				spreads.at(-1).attribute,
				match.moduleId,
				match.exportName,
				prop,
				'the effective prop may be supplied only by a spread',
			),
		);
	}

	if (prop === 'children') {
		const end = node.closingElement?.start ?? opening.end;
		return Object.freeze({ kind: 'children', range: range({ start: opening.end, end }) });
	}
	return Object.freeze({
		kind: 'absent',
		range: range({ start: opening.end, end: opening.end }),
	});
}

function freezeMatch(node, match, region) {
	const opening = node.openingElement ?? node;
	const start = match.tag?.loc?.start ?? node?.loc?.start;
	return Object.freeze({
		moduleId: match.moduleId,
		exportName: match.exportName,
		reference: Object.freeze({ kind: match.referenceKind, local: match.local }),
		ownerRenderer: match.metadata.ownerRenderer,
		childRenderer: match.metadata.childRenderer,
		prop: match.metadata.prop,
		elementRange: range(node),
		openingRange: range(opening),
		tagRange: range(match.tag),
		loc: start ? Object.freeze({ column: start.column, line: start.line }) : null,
		region,
	});
}

/** Build the compiler diagnostic for a statically known boundary in the wrong owner. */
export function rendererBoundaryOwnerDiagnostic(boundary, actualRenderer, filename) {
	const at = boundary.loc ? `${filename}:${boundary.loc.line}:${boundary.loc.column}` : filename;
	return Object.freeze({
		code: 'OCTANE_RENDERER_BOUNDARY_OWNER_MISMATCH',
		severity: 'error',
		filename,
		message:
			`Renderer boundary ${JSON.stringify(`${boundary.moduleId}#${boundary.exportName}`)} is declared ` +
			`for owner ${JSON.stringify(boundary.ownerRenderer)} but appears in ` +
			`${JSON.stringify(actualRenderer)} renderer content. Move it into a region owned by ` +
			`${JSON.stringify(boundary.ownerRenderer)} or use a boundary declared for ` +
			`${JSON.stringify(actualRenderer)}. (${at})`,
		range: boundary.tagRange,
		loc: boundary.loc,
	});
}

/**
 * Resolve statically-declared renderer boundaries in one TSRX module.
 *
 * The result is deliberately AST-free and serializable. Ranges are UTF-16
 * source offsets (the same coordinate system used by ESTree and String#slice).
 * When `renderer` is supplied, only boundaries owned by that renderer are
 * returned; omitting it is useful to inspect every transition in a module.
 */
export function analyzeRendererBoundaries(
	source,
	{ filename = 'unknown.tsrx', renderer, rendererBoundaries = {} } = {},
) {
	const ast = parseModule(source, filename);
	const imports = collectImports(ast, rendererBoundaries);
	const importNames = new Set([...imports.direct.keys(), ...imports.namespaces.keys()]);
	const rendererId = typeof renderer === 'string' ? renderer : renderer?.id;
	const boundaries = [];
	const diagnostics = [];
	const seen = new WeakSet();

	const walk = (node, shadowed) => {
		if (node == null || typeof node !== 'object') return;
		if (Array.isArray(node)) {
			for (const child of node) walk(child, shadowed);
			return;
		}
		if (seen.has(node)) return;
		seen.add(node);

		if (TRANSPARENT_TS_EXPRESSIONS.has(node.type)) {
			walk(node.expression, shadowed);
			return;
		}
		if (node.type?.startsWith('TS')) return;

		if (node.type === 'JSXElement' || node.type === 'Element') {
			const match = resolveTag(node, imports, shadowed);
			if (match && (rendererId == null || match.metadata.ownerRenderer === rendererId)) {
				const region = resolveRegion(node, match, filename, diagnostics);
				boundaries.push(freezeMatch(node, match, region));
			}
		}

		if (
			node.type === 'FunctionDeclaration' ||
			node.type === 'FunctionExpression' ||
			node.type === 'ArrowFunctionExpression'
		) {
			const inner = new Set(shadowed);
			if (node.id) addRelevantBindings(node.id, inner, importNames);
			for (const parameter of node.params ?? []) addRelevantBindings(parameter, inner, importNames);
			collectFunctionVarBindings(node.body, inner, importNames);
			for (const parameter of node.params ?? []) walk(parameter, inner);
			walk(node.body, inner);
			return;
		}

		if (node.type === 'ClassDeclaration' || node.type === 'ClassExpression') {
			const inner = new Set(shadowed);
			if (node.id) addRelevantBindings(node.id, inner, importNames);
			walk(node.superClass, inner);
			walk(node.body, inner);
			walk(node.decorators, inner);
			return;
		}

		if (node.type === 'BlockStatement' || node.type === 'JSXCodeBlock') {
			const inner = new Set(shadowed);
			addDirectScopeBindings(node.body, inner, importNames);
			walk(node.body, inner);
			if (node.type === 'JSXCodeBlock') walk(node.render, inner);
			return;
		}

		if (node.type === 'CatchClause') {
			const inner = new Set(shadowed);
			addRelevantBindings(node.param, inner, importNames);
			walk(node.body, inner);
			return;
		}

		if (
			node.type === 'ForStatement' ||
			node.type === 'ForInStatement' ||
			node.type === 'ForOfStatement'
		) {
			const inner = new Set(shadowed);
			const declaration = node.type === 'ForStatement' ? node.init : node.left;
			if (declaration?.type === 'VariableDeclaration') {
				for (const item of declaration.declarations ?? []) {
					addRelevantBindings(item.id, inner, importNames);
				}
			}
			walk(declaration, inner);
			walk(node.test, inner);
			walk(node.update, inner);
			walk(node.right, inner);
			walk(node.body, inner);
			return;
		}

		if (node.type === 'SwitchStatement') {
			const inner = new Set(shadowed);
			for (const branch of node.cases ?? []) {
				addDirectScopeBindings(branch.consequent, inner, importNames);
			}
			walk(node.discriminant, shadowed);
			walk(node.cases, inner);
			return;
		}

		if (node.type === 'VariableDeclarator') {
			walk(node.init, shadowed);
			return;
		}
		if (node.type === 'ImportDeclaration') return;
		if (node.type === 'ExportNamedDeclaration') {
			if (node.exportKind !== 'type') walk(node.declaration, shadowed);
			return;
		}
		if (node.type === 'ExportDefaultDeclaration') {
			walk(node.declaration, shadowed);
			return;
		}

		for (const [key, value] of Object.entries(node)) {
			if (
				key === 'loc' ||
				key === 'start' ||
				key === 'end' ||
				key === 'metadata' ||
				key === 'parent'
			) {
				continue;
			}
			walk(value, shadowed);
		}
	};

	walk(ast.body, new Set());
	boundaries.sort((left, right) => left.elementRange[0] - right.elementRange[0]);
	diagnostics.sort((left, right) => left.range[0] - right.range[0]);
	return Object.freeze({
		boundaries: Object.freeze(boundaries),
		diagnostics: Object.freeze(diagnostics),
		renderer: rendererId ?? null,
	});
}

/** Turn the first analysis error into the compiler's normal diagnostic path. */
export function assertRendererBoundaryAnalysis(analysis) {
	const diagnostic = analysis?.diagnostics?.[0];
	if (!diagnostic) return analysis;
	const error = new Error(`Octane renderer boundary: ${diagnostic.message}`);
	error.code = diagnostic.code;
	error.filename = diagnostic.filename;
	error.loc = diagnostic.loc;
	throw error;
}
