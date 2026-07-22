import MagicString from 'magic-string';
import { compileToVolarMappings } from 'octane/compiler/volar';
import { START_ENVIRONMENT_NAMES } from '#tanstack-start/plugin-core/vite';

/**
 * Remove the children of the Router ClientOnly binding before Octane compiles
 * server TSRX. This keeps client-only imports out of the server module graph,
 * while preserving fallback content and identically-named local components.
 */
export function octaneClientOnlyServerStrip() {
	return {
		name: 'octanejs-tanstack-start:client-only-server-strip',
		enforce: 'pre',
		applyToEnvironment(environment) {
			return environment.name === START_ENVIRONMENT_NAMES.server;
		},
		transform: {
			filter: {
				id: { include: [/\.tsrx($|\?)/] },
				code: { include: ['ClientOnly'] },
			},
			handler(code, id) {
				if (!code.includes('ClientOnly')) return undefined;

				const filename = id.split('?', 1)[0];
				const { sourceAst } = compileToVolarMappings(code, filename);
				const childReplacements = stripClientOnlyChildren(sourceAst);
				if (childReplacements.length === 0) return undefined;

				const prunedImportSpecifiers = findImportsUsedOnlyInRanges(sourceAst, childReplacements);
				const replacements = [
					...rewritePrunedImports(code, sourceAst, prunedImportSpecifiers),
					...childReplacements,
				];
				const output = new MagicString(code);
				for (const replacement of replacements.sort((a, b) => b.start - a.start)) {
					output.overwrite(replacement.start, replacement.end, replacement.content);
				}

				return {
					code: output.toString(),
					map: output.generateMap({
						source: filename,
						includeContent: true,
						hires: true,
					}),
				};
			},
		},
	};
}

function rewritePrunedImports(code, program, prunedImportSpecifiers) {
	const replacements = [];

	for (const statement of asNodes(program.body)) {
		if (
			statement.type !== 'ImportDeclaration' ||
			!hasRange(statement) ||
			!hasRange(statement.source)
		) {
			continue;
		}

		const prunedSpecifiers = prunedImportSpecifiers.get(statement);
		if (!prunedSpecifiers?.size) continue;

		const remainingSpecifiers = (statement.specifiers ?? []).filter(
			(specifier) => !prunedSpecifiers.has(specifier),
		);
		replacements.push({
			start: statement.start,
			end: statement.end,
			content: printRemainingImport(code, statement, remainingSpecifiers),
		});
	}

	return replacements;
}

function findImportsUsedOnlyInRanges(program, removedRanges) {
	const bindings = new Map();
	for (const statement of asNodes(program.body)) {
		if (statement.type !== 'ImportDeclaration' || statement.importKind === 'type') {
			continue;
		}
		for (const specifier of statement.specifiers ?? []) {
			const localName = specifier.local?.name;
			if (specifier.importKind === 'type' || !localName) continue;
			bindings.set(localName, {
				declaration: statement,
				specifier,
				removed: false,
				live: false,
			});
		}
	}

	if (bindings.size === 0 || removedRanges.length === 0) return new Map();

	visitImportedBindingReferences(program, bindings, removedRanges);

	const result = new Map();
	for (const usage of bindings.values()) {
		// Keep imports that were already unused: importing may intentionally run
		// module initialization. Only remove bindings whose uses were stripped.
		if (!usage.removed || usage.live) continue;
		const specifiers = result.get(usage.declaration) ?? new Set();
		specifiers.add(usage.specifier);
		result.set(usage.declaration, specifiers);
	}
	return result;
}

function visitImportedBindingReferences(program, bindings, removedRanges) {
	const visit = (value, shadowed, parent, parentKey, bindingPattern = false) => {
		if (!value || typeof value !== 'object') return;
		if (Array.isArray(value)) {
			for (const item of value) {
				visit(item, shadowed, parent, parentKey, bindingPattern);
			}
			return;
		}

		const node = value;
		if (node.type === 'ImportDeclaration') return;

		const scopedNames = scopeBindings(node);
		const nextShadowed = scopedNames.size ? new Set([...shadowed, ...scopedNames]) : shadowed;

		if (
			!bindingPattern &&
			isBindingReference(node, parent, parentKey) &&
			node.name &&
			!nextShadowed.has(node.name)
		) {
			const usage = bindings.get(node.name);
			if (usage && hasRange(node)) {
				if (isInsideRange(node, removedRanges)) usage.removed = true;
				else usage.live = true;
			}
		}

		for (const [key, child] of Object.entries(node)) {
			if (key === 'metadata' || key === 'loc' || key === 'parent') continue;
			visit(child, nextShadowed, node, key, isBindingPatternChild(node, key, bindingPattern));
		}
	};

	visit(program, new Set());
}

function isBindingReference(node, parent, parentKey) {
	if (node.type === 'Identifier') {
		if (!parent) return true;
		if (
			(parent.type === 'MemberExpression' || parent.type === 'OptionalMemberExpression') &&
			parentKey === 'property' &&
			!parent.computed
		) {
			return false;
		}
		if (
			(parent.type === 'Property' ||
				parent.type === 'PropertyDefinition' ||
				parent.type === 'MethodDefinition') &&
			parentKey === 'key' &&
			!parent.computed
		) {
			return Boolean(parent.shorthand);
		}
		if (parent.type === 'ExportSpecifier') return parentKey === 'local';
		if (
			(parent.type === 'LabeledStatement' ||
				parent.type === 'BreakStatement' ||
				parent.type === 'ContinueStatement') &&
			parentKey === 'label'
		) {
			return false;
		}
		return true;
	}

	if (node.type !== 'JSXIdentifier' || !node.name || !parent) return false;
	if (
		(parent.type === 'JSXOpeningElement' || parent.type === 'JSXClosingElement') &&
		parentKey === 'name'
	) {
		return true;
	}
	return parent.type === 'JSXMemberExpression' && parentKey === 'object';
}

function isBindingPatternChild(parent, key, parentIsBindingPattern) {
	if (parentIsBindingPattern) {
		if (parent.type === 'AssignmentPattern') return key === 'left';
		if (parent.type === 'Property') {
			return key === 'value' || (key === 'key' && !parent.computed);
		}
		return true;
	}

	if (parent.type === 'VariableDeclarator') return key === 'id';
	if (isFunction(parent)) return key === 'id' || key === 'params';
	if (parent.type === 'ClassDeclaration' || parent.type === 'ClassExpression') {
		return key === 'id';
	}
	if (parent.type === 'CatchClause') return key === 'param';
	if (parent.type === 'ImportSpecifier') return true;
	return false;
}

function isInsideRange(node, ranges) {
	return ranges.some((range) => range.start <= node.start && range.end >= node.end);
}

function printRemainingImport(code, statement, specifiers) {
	const sourceNode = statement.source;
	if (specifiers.length === 0 || !hasRange(sourceNode)) return '';

	const defaultSpecifier = specifiers.find(
		(specifier) => specifier.type === 'ImportDefaultSpecifier',
	);
	const namespaceSpecifier = specifiers.find(
		(specifier) => specifier.type === 'ImportNamespaceSpecifier',
	);
	const namedSpecifiers = specifiers.filter((specifier) => specifier.type === 'ImportSpecifier');
	const clauses = [];

	if (defaultSpecifier && hasRange(defaultSpecifier)) {
		clauses.push(code.slice(defaultSpecifier.start, defaultSpecifier.end));
	}
	if (namespaceSpecifier && hasRange(namespaceSpecifier)) {
		clauses.push(code.slice(namespaceSpecifier.start, namespaceSpecifier.end));
	}
	if (namedSpecifiers.length > 0) {
		clauses.push(
			`{ ${namedSpecifiers
				.filter(hasRange)
				.map((specifier) => code.slice(specifier.start, specifier.end))
				.join(', ')} }`,
		);
	}

	const source = code.slice(sourceNode.start, sourceNode.end);
	const suffix = hasRange(statement) ? code.slice(sourceNode.end, statement.end) : '';
	return `import ${clauses.join(', ')} from ${source}${suffix}`;
}

function stripClientOnlyChildren(program) {
	const importedNames = new Set();
	for (const statement of asNodes(program.body)) {
		if (statement.type !== 'ImportDeclaration' || statement.importKind === 'type') {
			continue;
		}

		for (const specifier of statement.specifiers ?? []) {
			if (
				specifier.type === 'ImportSpecifier' &&
				specifier.importKind !== 'type' &&
				specifier.imported?.name === 'ClientOnly' &&
				specifier.local?.name
			) {
				importedNames.add(specifier.local.name);
			}
		}
	}

	if (importedNames.size === 0) return [];

	const replacements = [];
	const visited = new WeakSet();
	const visit = (value, shadowed) => {
		if (!value || typeof value !== 'object' || visited.has(value)) return;
		visited.add(value);

		if (Array.isArray(value)) {
			for (const item of value) visit(item, shadowed);
			return;
		}

		const node = value;
		const scopedNames = scopeBindings(node);
		const nextShadowed = scopedNames.size ? new Set([...shadowed, ...scopedNames]) : shadowed;
		const elementName = node.openingElement?.name?.name;

		if (
			node.type === 'JSXElement' &&
			elementName &&
			importedNames.has(elementName) &&
			!nextShadowed.has(elementName) &&
			node.children?.length
		) {
			const first = node.children[0];
			const last = node.children[node.children.length - 1];
			if (first && last && hasRange(first) && hasRange(last) && last.end > first.start) {
				replacements.push({
					start: first.start,
					end: last.end,
					content: '{null}',
				});
			}
		}

		for (const [key, child] of Object.entries(node)) {
			if (key !== 'metadata' && key !== 'loc' && key !== 'parent') {
				visit(child, nextShadowed);
			}
		}
	};

	visit(program, new Set());

	// Replacing an outer ClientOnly child range also removes nested boundaries.
	return replacements.filter(
		(candidate, index) =>
			!replacements.some(
				(other, otherIndex) =>
					otherIndex !== index && other.start <= candidate.start && other.end >= candidate.end,
			),
	);
}

function scopeBindings(node) {
	const names = new Set();

	if (isFunction(node)) {
		for (const param of node.params ?? []) collectBindingNames(param, names);
		collectBindingNames(node.id, names);
		for (const statement of directStatements(node.body)) {
			collectStatementBindings(statement, names);
		}
		collectFunctionVarBindings(node.body, names);
	} else if (node.type === 'BlockStatement' || node.type === 'JSXCodeBlock') {
		for (const statement of directStatements(node)) {
			collectStatementBindings(statement, names);
		}
	} else if (node.type === 'CatchClause') {
		collectBindingNames(node.param, names);
	} else if (
		node.type === 'ForStatement' ||
		node.type === 'ForInStatement' ||
		node.type === 'ForOfStatement'
	) {
		const declaration = node.init ?? node.left;
		if (declaration?.type === 'VariableDeclaration' && declaration.kind !== 'var') {
			for (const item of declaration.declarations ?? []) {
				collectBindingNames(item.id, names);
			}
		}
	} else if (node.type === 'SwitchStatement') {
		for (const switchCase of asNodes(node.cases)) {
			for (const statement of asNodes(switchCase.consequent)) {
				collectStatementBindings(statement, names);
			}
		}
	} else if (node.type === 'StaticBlock') {
		for (const statement of directStatements(node)) {
			collectStatementBindings(statement, names);
		}
	} else if (node.type === 'ClassDeclaration' || node.type === 'ClassExpression') {
		collectBindingNames(node.id, names);
	}

	return names;
}

function directStatements(node) {
	if (Array.isArray(node)) return node;
	if (!node || !Array.isArray(node.body)) return [];
	return asNodes(node.body);
}

function collectStatementBindings(statement, output) {
	const declaration =
		statement.type === 'ExportNamedDeclaration' || statement.type === 'ExportDefaultDeclaration'
			? statement.declaration
			: statement;

	if (declaration?.type === 'VariableDeclaration') {
		for (const item of declaration.declarations ?? []) {
			collectBindingNames(item.id, output);
		}
	} else if (
		declaration?.type === 'FunctionDeclaration' ||
		declaration?.type === 'ClassDeclaration'
	) {
		collectBindingNames(declaration.id, output);
	}
}

function collectFunctionVarBindings(value, output) {
	const visited = new WeakSet();
	const visit = (child, root = false) => {
		if (!child || typeof child !== 'object' || visited.has(child)) return;
		visited.add(child);

		if (Array.isArray(child)) {
			for (const item of child) visit(item);
			return;
		}

		const node = child;
		if (!root && isFunction(node)) return;
		if (node.type === 'VariableDeclaration' && node.kind === 'var') {
			for (const item of node.declarations ?? []) {
				collectBindingNames(item.id, output);
			}
		}
		for (const [key, nested] of Object.entries(node)) {
			if (key !== 'metadata' && key !== 'loc' && key !== 'parent') {
				visit(nested);
			}
		}
	};

	visit(value, true);
}

function collectBindingNames(pattern, output) {
	if (!pattern) return;
	if (pattern.type === 'Identifier' && pattern.name) {
		output.add(pattern.name);
		return;
	}
	if (pattern.type === 'RestElement') {
		collectBindingNames(pattern.argument, output);
		return;
	}
	if (pattern.type === 'AssignmentPattern') {
		collectBindingNames(pattern.left, output);
		return;
	}
	if (pattern.type === 'ArrayPattern') {
		for (const element of asNodes(pattern.elements)) {
			collectBindingNames(element, output);
		}
		return;
	}
	if (pattern.type === 'ObjectPattern') {
		for (const property of asNodes(pattern.properties)) {
			collectBindingNames(property.argument ?? property.value, output);
		}
	}
}

function isFunction(node) {
	return (
		node.type === 'FunctionDeclaration' ||
		node.type === 'FunctionExpression' ||
		node.type === 'ArrowFunctionExpression'
	);
}

function hasRange(node) {
	return typeof node?.start === 'number' && typeof node.end === 'number';
}

function asNodes(value) {
	return Array.isArray(value) ? value : [];
}
