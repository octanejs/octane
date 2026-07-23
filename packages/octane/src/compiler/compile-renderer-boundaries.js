import {
	analyzeRendererBoundaries,
	assertRendererBoundaryAnalysis,
	rendererBoundaryOwnerDiagnostic,
} from './renderer-boundaries.js';
import { lowerUniversalRendererRegionAst } from './compile-universal.js';
import { builders as b, clone_ast_node, parseModule } from '@tsrx/core';

const DOM_RENDERER = Object.freeze({ id: 'dom', module: 'octane', target: 'dom' });
const AUTO_RUNTIME_HOOKS = new Set([
	'use',
	'useState',
	'useReducer',
	'useEffect',
	'useLayoutEffect',
	'useInsertionEffect',
	'useMemo',
	'useCallback',
	'useRef',
	'useId',
	'useEffectEvent',
	'useImperativeHandle',
	'useDeferredValue',
	'useTransition',
	'useSyncExternalStore',
	'useActionState',
	'useFormStatus',
	'useOptimistic',
	'useContext',
]);
const AST_SKIP_KEYS = new Set(['end', 'loc', 'metadata', 'parent', 'range', 'start']);

function inheritGeneratedOrigin(root, origin) {
	const seen = new WeakSet();
	const visit = (value) => {
		if (!value || typeof value !== 'object' || seen.has(value)) return;
		seen.add(value);
		if (Array.isArray(value)) {
			for (const item of value) visit(item);
			return;
		}
		if (typeof value.type === 'string' && value.loc == null && origin?.loc != null) {
			value.start = origin.start;
			value.end = origin.end;
			value.loc = origin.loc;
		}
		for (const [key, child] of Object.entries(value)) {
			if (!AST_SKIP_KEYS.has(key)) visit(child);
		}
	};
	visit(root);
	return root;
}

function mapAstCow(value, replace) {
	if (!value || typeof value !== 'object') return value;
	if (Array.isArray(value)) {
		let output = null;
		for (let index = 0; index < value.length; index++) {
			const mapped = mapAstCow(value[index], replace);
			if (output === null && mapped !== value[index]) output = value.slice(0, index);
			if (output !== null && mapped !== null) output.push(mapped);
		}
		return output ?? value;
	}
	const replacement = replace(value);
	if (replacement !== undefined) return replacement;
	let output = null;
	for (const [key, child] of Object.entries(value)) {
		if (AST_SKIP_KEYS.has(key)) continue;
		const mapped = mapAstCow(child, replace);
		if (mapped !== child) {
			if (output === null) output = { ...value };
			output[key] = mapped;
		}
	}
	return output ?? value;
}

function resolveRenderer(registry, id, filename) {
	const entry = id === 'dom' ? (registry?.dom ?? DOM_RENDERER) : registry?.[id];
	const renderer = entry && Object.freeze({ id, ...entry });
	if (!renderer) {
		throw new Error(
			`Octane renderer boundary in ${filename} references ${JSON.stringify(id)} without a compiler renderer registry entry.`,
		);
	}
	return renderer;
}

function regionContains(boundary, candidate) {
	const range = boundary.region?.range ?? boundary.region?.valueRange;
	return (
		range != null && range[0] <= candidate.elementRange[0] && candidate.elementRange[1] <= range[1]
	);
}

function buildBoundaryTree(boundaries) {
	const nodes = boundaries.map((boundary) => ({ boundary, children: [] }));
	const roots = [];
	for (let index = 0; index < nodes.length; index++) {
		const node = nodes[index];
		let parent = null;
		let parentSize = Infinity;
		for (let candidateIndex = 0; candidateIndex < index; candidateIndex++) {
			const candidate = nodes[candidateIndex];
			if (!regionContains(candidate.boundary, node.boundary)) continue;
			const range = candidate.boundary.region?.range ?? candidate.boundary.region?.valueRange;
			const size = range[1] - range[0];
			if (size < parentSize) {
				parent = candidate;
				parentSize = size;
			}
		}
		if (parent === null) roots.push(node);
		else parent.children.push(node);
	}
	return roots;
}

function throwDiagnostic(diagnostic) {
	const error = new Error(`Octane renderer boundary: ${diagnostic.message}`);
	error.code = diagnostic.code;
	error.filename = diagnostic.filename;
	error.loc = diagnostic.loc;
	throw error;
}

function validateBoundaryOwners(nodes, ownerRenderer, filename) {
	for (const node of nodes) {
		const boundary = node.boundary;
		if (boundary.ownerRenderer !== ownerRenderer) {
			throwDiagnostic(rendererBoundaryOwnerDiagnostic(boundary, ownerRenderer, filename));
		}
		validateBoundaryOwners(node.children, boundary.childRenderer, filename);
	}
}

function analyzeBoundaryTree(
	source,
	filename,
	ownerRenderer,
	rendererBoundaries,
	parsedAst = null,
) {
	if (!rendererBoundaries || Object.keys(rendererBoundaries).length === 0) return null;
	// Analyze every declared boundary first. Ownership is semantic: a nested
	// boundary is interpreted under the renderer selected by its nearest owning
	// region, not the file's lexical default.
	const analysis = analyzeRendererBoundaries(source, {
		ast: parsedAst,
		filename,
		rendererBoundaries,
	});
	assertRendererBoundaryAnalysis(analysis);
	const roots = buildBoundaryTree(analysis.boundaries);
	validateBoundaryOwners(roots, ownerRenderer.id, filename);
	return { analysis, roots };
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

function isMemoCall(node, runtime) {
	if (node?.type !== 'CallExpression') return false;
	if (node.callee?.type === 'Identifier') {
		return runtime.direct.get(node.callee.name) === 'memo';
	}
	return (
		node.callee?.type === 'MemberExpression' &&
		!node.callee.computed &&
		node.callee.object?.type === 'Identifier' &&
		node.callee.property?.type === 'Identifier' &&
		node.callee.property.name === 'memo' &&
		runtime.namespaces.has(node.callee.object.name)
	);
}

function localComponentDeclaration(statement, runtime) {
	const declaration = directDeclaration(statement);
	if (declaration?.type === 'FunctionDeclaration' && declaration.id?.name) {
		return { declaration, id: declaration.id, name: declaration.id.name };
	}
	if (declaration?.type !== 'VariableDeclaration' || declaration.declarations?.length !== 1) {
		return null;
	}
	const item = declaration.declarations[0];
	if (item.id?.type !== 'Identifier') {
		return null;
	}
	const directFunction =
		item.init?.type === 'ArrowFunctionExpression' || item.init?.type === 'FunctionExpression';
	const memoFunction = isMemoCall(item.init, runtime)
		? item.init.arguments?.[0]?.type === 'ArrowFunctionExpression' ||
			item.init.arguments?.[0]?.type === 'FunctionExpression'
		: false;
	if (!directFunction && !memoFunction) return null;
	return { declaration, id: item.id, name: item.id.name };
}

function addBindingNames(pattern, output) {
	if (!pattern) return;
	if (pattern.type === 'Identifier' || pattern.type === 'JSXIdentifier') {
		output.add(pattern.name);
		return;
	}
	if (pattern.type === 'RestElement') return addBindingNames(pattern.argument, output);
	if (pattern.type === 'AssignmentPattern') return addBindingNames(pattern.left, output);
	if (pattern.type === 'ArrayPattern') {
		for (const element of pattern.elements ?? []) addBindingNames(element, output);
		return;
	}
	if (pattern.type === 'ObjectPattern') {
		for (const property of pattern.properties ?? []) {
			addBindingNames(property.argument ?? property.value, output);
		}
	}
}

function blockBindings(statements) {
	const output = new Set();
	for (const statement of statements ?? []) {
		const declaration = directDeclaration(statement);
		if (declaration?.type === 'FunctionDeclaration' || declaration?.type === 'ClassDeclaration') {
			addBindingNames(declaration.id, output);
		} else if (declaration?.type === 'VariableDeclaration' && declaration.kind !== 'var') {
			for (const item of declaration.declarations ?? []) addBindingNames(item.id, output);
		}
	}
	return output;
}

function functionVarBindings(body) {
	const output = new Set();
	const ancestors = new WeakSet();
	const visit = (node, root = false) => {
		if (!node || typeof node !== 'object') return;
		if (Array.isArray(node)) {
			for (const child of node) visit(child);
			return;
		}
		if (ancestors.has(node)) return;
		if (
			!root &&
			(node.type === 'FunctionDeclaration' ||
				node.type === 'FunctionExpression' ||
				node.type === 'ArrowFunctionExpression')
		) {
			return;
		}
		ancestors.add(node);
		if (node.type === 'VariableDeclaration' && node.kind === 'var') {
			for (const item of node.declarations ?? []) addBindingNames(item.id, output);
		}
		for (const [key, child] of Object.entries(node)) {
			if (key === 'loc' || key === 'start' || key === 'end' || key === 'metadata') continue;
			visit(child);
		}
		ancestors.delete(node);
	};
	visit(body, true);
	return output;
}

function rootFunctionOf(node) {
	const declaration = directDeclaration(node);
	if (
		declaration?.type === 'FunctionDeclaration' ||
		declaration?.type === 'FunctionExpression' ||
		declaration?.type === 'ArrowFunctionExpression'
	) {
		return declaration;
	}
	if (declaration?.type === 'VariableDeclaration' && declaration.declarations?.length === 1) {
		const init = declaration.declarations[0].init;
		if (init?.type === 'FunctionExpression' || init?.type === 'ArrowFunctionExpression')
			return init;
	}
	return null;
}

// Resolve only references that still reach the module binding. A nested
// parameter/declaration with the same spelling must stay attached to that
// nested binding in the clone; name-only rewriting would silently change the
// authored component graph.
function walkScopedReferences(root, callbacks) {
	const scopes = [];
	const ancestors = new WeakSet();
	const rootFunction = rootFunctionOf(root);
	const shadowed = (name) => {
		for (let index = scopes.length - 1; index >= 0; index--) {
			if (scopes[index].has(name)) return true;
		}
		return false;
	};
	const visit = (node) => {
		if (!node || typeof node !== 'object') return;
		if (Array.isArray(node)) {
			for (const child of node) visit(child);
			return;
		}
		if (ancestors.has(node)) return;
		ancestors.add(node);

		if (
			node.type === 'FunctionDeclaration' ||
			node.type === 'FunctionExpression' ||
			node.type === 'ArrowFunctionExpression'
		) {
			const bindings = functionVarBindings(node.body);
			if (node !== rootFunction) addBindingNames(node.id, bindings);
			for (const parameter of node.params ?? []) addBindingNames(parameter, bindings);
			scopes.push(bindings);
			for (const parameter of node.params ?? []) visit(parameter);
			visit(node.body);
			scopes.pop();
			ancestors.delete(node);
			return;
		}

		if (node.type === 'BlockStatement') {
			scopes.push(blockBindings(node.body));
			for (const statement of node.body ?? []) visit(statement);
			scopes.pop();
			ancestors.delete(node);
			return;
		}

		if (node.type === 'CatchClause') {
			const bindings = new Set();
			addBindingNames(node.param, bindings);
			scopes.push(bindings);
			visit(node.param);
			visit(node.body);
			scopes.pop();
			ancestors.delete(node);
			return;
		}

		if (
			node.type === 'ForStatement' ||
			node.type === 'ForInStatement' ||
			node.type === 'ForOfStatement' ||
			node.type === 'JSXForExpression'
		) {
			const declaration = node.left ?? node.init;
			const bindings = new Set();
			if (declaration?.type === 'VariableDeclaration') {
				for (const item of declaration.declarations ?? []) addBindingNames(item.id, bindings);
			}
			if (node.right) visit(node.right);
			scopes.push(bindings);
			if (node.init) visit(node.init);
			if (node.test) visit(node.test);
			if (node.update) visit(node.update);
			visit(node.body);
			visit(node.empty);
			scopes.pop();
			ancestors.delete(node);
			return;
		}

		if (node.type === 'JSXElement' || node.type === 'Element') {
			const names = [node.openingElement?.name ?? node.name, node.closingElement?.name];
			for (const name of names) {
				if (
					(name?.type === 'JSXIdentifier' || name?.type === 'Identifier') &&
					!shadowed(name.name)
				) {
					callbacks.tag?.(name, name.name);
				}
			}
		}
		if (node.type === 'CallExpression') {
			if (node.callee?.type === 'Identifier' && !shadowed(node.callee.name)) {
				callbacks.call?.(node.callee, node.callee.name);
			} else if (
				node.callee?.type === 'MemberExpression' &&
				!node.callee.computed &&
				node.callee.object?.type === 'Identifier' &&
				node.callee.property?.type === 'Identifier' &&
				!shadowed(node.callee.object.name)
			) {
				callbacks.memberCall?.(node.callee, node.callee.object.name, node.callee.property.name);
			}
		}
		for (const [key, child] of Object.entries(node)) {
			if (key === 'loc' || key === 'start' || key === 'end' || key === 'metadata') continue;
			visit(child);
		}
		ancestors.delete(node);
	};
	visit(root);
}

function jsxComponentReferences(node, localNames) {
	const output = new Set();
	walkScopedReferences(node, {
		tag(_node, name) {
			if (localNames.has(name)) output.add(name);
		},
	});
	return output;
}

function localCallReferences(node, localNames) {
	const output = new Set();
	walkScopedReferences(node, {
		call(_node, name) {
			if (localNames.has(name)) output.add(name);
		},
	});
	return output;
}

function collectRuntimeCalls(node, runtime, callback) {
	walkScopedReferences(node, {
		call(callee, local) {
			const imported =
				runtime.direct.get(local) ??
				(AUTO_RUNTIME_HOOKS.has(local) && !runtime.moduleBindings.has(local) ? local : null);
			if (imported) callback(callee, imported);
		},
		memberCall(callee, namespace, imported) {
			if (runtime.namespaces.has(namespace)) callback(callee, imported);
		},
	});
}

function collectRuntimeCallNames(node, runtime) {
	const output = new Set();
	collectRuntimeCalls(node, runtime, (_callee, imported) => output.add(imported));
	return output;
}

function collectLocalSpecializationInfo(source, filename, parsedAst = null) {
	const ast = parsedAst ?? parseModule(source, filename);
	const components = new Map();
	const exported = new Set();
	const runtime = { direct: new Map(), namespaces: new Set(), moduleBindings: new Set() };
	for (const statement of ast.body ?? []) {
		if (statement.type === 'ImportDeclaration') {
			for (const specifier of statement.specifiers ?? []) {
				if (specifier.local?.name) runtime.moduleBindings.add(specifier.local.name);
			}
		}
		const declaration = directDeclaration(statement);
		if (declaration?.id) addBindingNames(declaration.id, runtime.moduleBindings);
		if (declaration?.type === 'VariableDeclaration') {
			for (const item of declaration.declarations ?? []) {
				addBindingNames(item.id, runtime.moduleBindings);
			}
		}
		if (statement.type === 'ImportDeclaration' && statement.source?.value === 'octane') {
			for (const specifier of statement.specifiers ?? []) {
				if (specifier.importKind === 'type') continue;
				const local = specifier.local?.name;
				if (!local) continue;
				if (specifier.type === 'ImportNamespaceSpecifier') runtime.namespaces.add(local);
				else if (specifier.type === 'ImportSpecifier') {
					runtime.direct.set(local, specifier.imported?.name ?? specifier.imported?.value);
				}
			}
			continue;
		}
	}
	for (const statement of ast.body ?? []) {
		const component = localComponentDeclaration(statement, runtime);
		if (component !== null) components.set(component.name, component);
		if (statement.type === 'ExportNamedDeclaration' && statement.source == null) {
			if (component !== null) exported.add(component.name);
			for (const specifier of statement.specifiers ?? []) {
				if (specifier.local?.name) exported.add(specifier.local.name);
			}
		}
		if (statement.type === 'ExportDefaultDeclaration') {
			if (component !== null) exported.add(component.name);
			if (statement.declaration?.type === 'Identifier') exported.add(statement.declaration.name);
		}
	}
	return { ast, components, exported, runtime };
}

function owningComponentForReference(components, node) {
	for (const component of components.values()) {
		if (component.declaration.start <= node.start && node.end <= component.declaration.end) {
			return component.name;
		}
	}
	return null;
}

function ownerReachableComponentsAst(ast, localSpecializations) {
	const localNames = new Set(localSpecializations.components.keys());
	const dependencies = new Map();
	const reachable = new Set(
		[...localSpecializations.exported].filter((name) => localNames.has(name)),
	);
	const record = (node, name) => {
		if (!localNames.has(name)) return;
		const owner = owningComponentForReference(localSpecializations.components, node);
		if (owner === null) {
			reachable.add(name);
			return;
		}
		let references = dependencies.get(owner);
		if (references === undefined) dependencies.set(owner, (references = new Set()));
		references.add(name);
	};
	walkScopedReferences(ast, {
		call: record,
		tag: record,
	});
	const queue = [...reachable];
	while (queue.length > 0) {
		for (const dependency of dependencies.get(queue.shift()) ?? []) {
			if (reachable.has(dependency)) continue;
			reachable.add(dependency);
			queue.push(dependency);
		}
	}
	return reachable;
}

function createNameAllocator(source) {
	const names = new Set();
	const universalPrefixes = new Set();
	let universalIndex = 0;
	return {
		name(preferred) {
			let name = preferred;
			while (source.includes(name) || names.has(name)) name += '$';
			names.add(name);
			return name;
		},
		universalIndex() {
			for (;;) {
				const index = universalIndex++;
				const prefix = `__octaneRendererRegion${index}`;
				if (source.includes(prefix) || universalPrefixes.has(prefix)) continue;
				universalPrefixes.add(prefix);
				return index;
			}
		},
	};
}

function astNodeIndex(ast) {
	const byRange = new Map();
	const seen = new WeakSet();
	const visit = (node) => {
		if (!node || typeof node !== 'object' || seen.has(node)) return;
		seen.add(node);
		if (Array.isArray(node)) {
			for (const child of node) visit(child);
			return;
		}
		if (typeof node.start === 'number' && typeof node.end === 'number') {
			const key = `${node.start}:${node.end}`;
			const nodes = byRange.get(key);
			if (nodes === undefined) byRange.set(key, [node]);
			else nodes.push(node);
		}
		for (const [key, child] of Object.entries(node)) {
			if (!AST_SKIP_KEYS.has(key)) visit(child);
		}
	};
	visit(ast);
	return byRange;
}

function findIndexedNode(index, range, predicate) {
	return (index.get(`${range[0]}:${range[1]}`) ?? []).find(predicate) ?? null;
}

function attachBoundaryAstNodes(nodes, index) {
	for (const node of nodes) {
		node.astNode = findIndexedNode(
			index,
			node.boundary.elementRange,
			(candidate) => candidate.type === 'JSXElement' || candidate.type === 'Element',
		);
		if (node.astNode === null) {
			throw new Error('Octane renderer boundary could not resolve its parsed JSX element.');
		}
		attachBoundaryAstNodes(node.children, index);
	}
}

function rendererBoundaryAttribute(boundary, element) {
	if (boundary.region.kind !== 'attribute') return null;
	const range = boundary.region.attributeRange;
	return (element.openingElement?.attributes ?? element.attributes ?? []).find(
		(attribute) => attribute.start === range[0] && attribute.end === range[1],
	);
}

function rendererBoundaryPropAttribute(boundary, expression, origin) {
	return inheritGeneratedOrigin(
		b.jsx_attribute(
			b.jsx_id(boundary.prop, origin),
			b.jsx_expression_container(expression, origin),
			false,
			origin,
		),
		origin,
	);
}

function replaceBoundaryPropAst(element, boundary, expression) {
	const opening = element.openingElement;
	const attributes = opening?.attributes ?? element.attributes ?? [];
	let nextAttributes = attributes;
	let nextChildren = element.children ?? [];
	if (boundary.region.kind === 'children') {
		nextAttributes = [
			...attributes,
			rendererBoundaryPropAttribute(boundary, expression, opening ?? element),
		];
		nextChildren = [];
	} else if (boundary.region.kind === 'attribute') {
		const selected = rendererBoundaryAttribute(boundary, element);
		nextAttributes = attributes.map((attribute) =>
			attribute === selected
				? rendererBoundaryPropAttribute(boundary, expression, attribute)
				: attribute,
		);
	} else {
		nextAttributes = [
			...attributes,
			rendererBoundaryPropAttribute(boundary, expression, opening ?? element),
		];
	}
	return inheritGeneratedOrigin(b.jsx_element(element, nextAttributes, nextChildren), element);
}

function boundaryRegionAst(element, boundary, nestedReplacements) {
	const replaceNested = (value) =>
		mapAstCow(value, (node) =>
			nestedReplacements.has(node) ? nestedReplacements.get(node) : undefined,
		);
	const region = boundary.region;
	if (region.kind === 'children') {
		return inheritGeneratedOrigin(b.jsx_fragment(replaceNested(element.children ?? [])), element);
	}
	if (region.kind === 'absent') return inheritGeneratedOrigin(b.literal(null, 'null'), element);
	if (region.valueKind === 'boolean') {
		return inheritGeneratedOrigin(b.literal(true), rendererBoundaryAttribute(boundary, element));
	}
	if (region.valueKind === 'literal') {
		return inheritGeneratedOrigin(
			b.literal(region.value),
			rendererBoundaryAttribute(boundary, element),
		);
	}
	const attribute = rendererBoundaryAttribute(boundary, element);
	return replaceNested(attribute?.value?.expression);
}

function astNameReplacement(node, name) {
	return node.type === 'JSXIdentifier' ? b.jsx_id(name, node) : b.id(name, node);
}

function collectSpecializationAstReplacements(node, cloneNames, runtime, aliases, binding = null) {
	const replacements = new WeakMap();
	if (binding !== null)
		replacements.set(binding.node, astNameReplacement(binding.node, binding.name));
	walkScopedReferences(node, {
		tag(name, local) {
			const replacement = cloneNames.get(local);
			if (replacement !== undefined) {
				replacements.set(name, astNameReplacement(name, replacement));
			}
		},
		call(callee, local) {
			const component = cloneNames.get(local);
			if (component !== undefined) {
				replacements.set(callee, b.id(component, callee));
				return;
			}
			const imported =
				runtime.direct.get(local) ??
				(AUTO_RUNTIME_HOOKS.has(local) && !runtime.moduleBindings.has(local) ? local : null);
			const alias = imported === null ? undefined : aliases.get(imported);
			if (alias !== undefined) replacements.set(callee, b.id(alias, callee));
		},
		memberCall(callee, namespace, imported) {
			if (!runtime.namespaces.has(namespace)) return;
			const alias = aliases.get(imported);
			if (alias !== undefined) replacements.set(callee, b.id(alias, callee));
		},
	});
	return replacements;
}

function specializeLocalComponentsAst(region, index, state) {
	const localNames = new Set(state.localSpecializations.components.keys());
	const selected = new Set([
		...jsxComponentReferences(region, localNames),
		...localCallReferences(region, localNames),
	]);
	const queue = [...selected];
	while (queue.length > 0) {
		const name = queue.shift();
		const component = state.localSpecializations.components.get(name);
		if (!component) continue;
		for (const reference of new Set([
			...jsxComponentReferences(component.declaration, localNames),
			...localCallReferences(component.declaration, localNames),
		])) {
			if (selected.has(reference)) continue;
			selected.add(reference);
			queue.push(reference);
		}
	}
	for (const name of selected) state.specializedLocalNames.add(name);

	const prefix = `__octaneRendererRegion${index}`;
	const cloneNames = new Map();
	for (const name of selected) {
		const preferred = /^use[A-Z]/.test(name)
			? `useOctaneRendererRegion${index}${name.slice(3)}`
			: `${prefix}${name}`;
		cloneNames.set(name, state.names.name(preferred));
	}
	const runtimeNames = new Set(collectRuntimeCallNames(region, state.localSpecializations.runtime));
	for (const name of selected) {
		const component = state.localSpecializations.components.get(name);
		if (!component) continue;
		for (const imported of collectRuntimeCallNames(
			component.declaration,
			state.localSpecializations.runtime,
		)) {
			runtimeNames.add(imported);
		}
	}
	const aliases = new Map();
	for (const imported of runtimeNames) {
		aliases.set(imported, state.names.name(`${imported}$${prefix}`));
	}
	const regionReplacements = collectSpecializationAstReplacements(
		region,
		cloneNames,
		state.localSpecializations.runtime,
		aliases,
	);
	const rewrittenRegion = clone_ast_node(
		mapAstCow(region, (node) =>
			regionReplacements.has(node) ? regionReplacements.get(node) : undefined,
		),
	);
	const components = [];
	const validationRanges =
		region.type === 'JSXFragment'
			? (region.children ?? []).map((node) => ({ start: node.start, end: node.end }))
			: [{ start: region.start, end: region.end }];
	for (const name of [...selected].sort(
		(left, right) =>
			state.localSpecializations.components.get(left).declaration.start -
			state.localSpecializations.components.get(right).declaration.start,
	)) {
		const component = state.localSpecializations.components.get(name);
		const replacements = collectSpecializationAstReplacements(
			component.declaration,
			cloneNames,
			state.localSpecializations.runtime,
			aliases,
			{ node: component.id, name: cloneNames.get(name) },
		);
		const declaration = clone_ast_node(
			mapAstCow(component.declaration, (node) =>
				replacements.has(node) ? replacements.get(node) : undefined,
			),
		);
		components.push(inheritGeneratedOrigin(b.export(declaration), component.declaration));
		validationRanges.push({
			start: component.declaration.start,
			end: component.declaration.end,
		});
	}
	return {
		components,
		region: rewrittenRegion,
		runtimeImports: [...aliases].map(([imported, local]) => ({ imported, local })),
		validationRanges,
	};
}

function lowerBoundaryNodeAst(node, ownerRenderer, state) {
	const boundary = node.boundary;
	const childRenderer = resolveRenderer(
		state.rendererRegistry,
		boundary.childRenderer,
		state.filename,
	);
	const nestedReplacements = new WeakMap();
	for (const child of node.children) {
		const lowered = lowerBoundaryNodeAst(child, childRenderer, state);
		nestedReplacements.set(
			child.astNode,
			replaceBoundaryPropAst(child.astNode, child.boundary, lowered.expression),
		);
	}
	const value = boundaryRegionAst(node.astNode, boundary, nestedReplacements);

	if (childRenderer.target === 'universal') {
		const index = state.names.universalIndex();
		const specialization = specializeLocalComponentsAst(value, index, state);
		const deferredRendererRegions = state.domRegions.filter((region) =>
			containsIdentifier(specialization.region, region.token),
		);
		const lowered = lowerUniversalRendererRegionAst(
			specialization.region,
			state.filename,
			ownerRenderer,
			childRenderer,
			index,
			{
				authoredAst: state.ast,
				authoredSource: state.source,
				components: specialization.components,
				deferredRendererRegions,
				hmr: state.hmr,
				profile: state.profile,
				profileFilename: state.profileFilename,
				runtimeImports: specialization.runtimeImports,
				universalRuntime: state.universalRuntime,
				validationExclusions: deferredRendererRegions.map((region) => ({
					start: region.source.start,
					end: region.source.end,
				})),
				validationRanges: specialization.validationRanges,
			},
		);
		for (const reference of lowered.validationImportReferences) {
			state.childValidationImportReferences.set(`${reference.start}:${reference.end}`, reference);
		}
		state.preludes.push(...lowered.statements);
		state.universalUnits.push(lowered.metadata);
		return { expression: lowered.expression };
	}

	if (ownerRenderer.target === 'universal' && childRenderer.target === 'dom') {
		const token = state.names.name('__octaneDomRendererRegionToken');
		state.domRegions.push(
			Object.freeze({
				bind: state.names.name('__octaneBindRendererRegionOwner'),
				body: state.names.name('__octaneDomRendererRegionBody'),
				childRenderer,
				helper: state.names.name('__octaneRendererRegionDescriptor'),
				kind: boundary.region.kind === 'children' ? 'children' : 'expression',
				ownerRenderer,
				renderToken: state.names.name('__octaneDomRendererRegionRenderToken'),
				source: clone_ast_node(value),
				token,
			}),
		);
		return { expression: inheritGeneratedOrigin(b.id(token), node.astNode) };
	}

	throw new Error(
		`Octane renderer boundary ${JSON.stringify(`${boundary.moduleId}#${boundary.exportName}`)} cannot lower ${JSON.stringify(ownerRenderer.target)} -> ${JSON.stringify(childRenderer.target)} regions.`,
	);
}

function containsIdentifier(root, name) {
	let found = false;
	const seen = new WeakSet();
	const visit = (node) => {
		if (found || !node || typeof node !== 'object' || seen.has(node)) return;
		seen.add(node);
		if (Array.isArray(node)) {
			for (const child of node) visit(child);
			return;
		}
		if (node.type === 'Identifier' && node.name === name) {
			found = true;
			return;
		}
		for (const [key, child] of Object.entries(node)) {
			if (!AST_SKIP_KEYS.has(key)) visit(child);
		}
	};
	visit(root);
	return found;
}

export function expandDomRendererRegionsAst(ast, domRegions) {
	if (!domRegions || domRegions.length === 0) return ast;
	const replacements = new Map();
	const prelude = [];
	for (const region of domRegions) {
		const origin = region.source;
		prelude.push(
			inheritGeneratedOrigin(
				b.imports([['rendererRegion', region.helper]], region.ownerRenderer.module),
				origin,
			),
			inheritGeneratedOrigin(
				b.imports([['bindRendererRegionOwner', region.bind]], 'octane'),
				origin,
			),
			inheritGeneratedOrigin(
				b.const(
					region.body,
					b.arrow(
						[b.id('props')],
						b.block([
							b.stmt(b.call(region.bind, b.id('props'))),
							b.return(b.call(b.member(b.id('props'), 'render'))),
						]),
					),
				),
				origin,
			),
		);
	}
	for (const region of domRegions) {
		const source = mapAstCow(region.source, (node) =>
			node.type === 'Identifier' && replacements.has(node.name)
				? replacements.get(node.name)
				: undefined,
		);
		const render = inheritGeneratedOrigin(b.arrow([], source), source);
		const expression = inheritGeneratedOrigin(
			b.call(
				region.helper,
				b.literal(region.ownerRenderer.id),
				b.literal(region.childRenderer.id),
				b.id(region.body),
				b.object([b.prop('init', b.id('render'), render)]),
			),
			source,
		);
		replacements.set(region.renderToken, render);
		replacements.set(region.token, expression);
	}
	const expanded = mapAstCow(ast, (node) =>
		node.type === 'Identifier' && replacements.has(node.name)
			? clone_ast_node(replacements.get(node.name))
			: undefined,
	);
	return { ...expanded, body: [...prelude, ...(expanded.body ?? [])] };
}

export function prepareRendererBoundaryRegions(
	source,
	filename,
	ownerRenderer,
	options = {},
	parsedAst = null,
) {
	const { rendererBoundaries, rendererRegistry } = options;
	const ast = parsedAst ?? parseModule(source, filename);
	const tree = analyzeBoundaryTree(source, filename, ownerRenderer, rendererBoundaries, ast);
	if (tree === null || tree.roots.length === 0) return null;
	attachBoundaryAstNodes(tree.roots, astNodeIndex(ast));

	const state = {
		ast,
		childValidationImportReferences: new Map(),
		domRegions: [],
		filename,
		hmr: options?.hmr === true ? 'vite' : options?.hmr || false,
		localSpecializations: collectLocalSpecializationInfo(source, filename, ast),
		names: createNameAllocator(source),
		preludes: [],
		profile: options?.profile === true,
		profileFilename: options?.profileFilename,
		rendererRegistry,
		source,
		specializedLocalNames: new Set(),
		universalRuntime: options?.universalRuntime,
		universalUnits: [],
	};
	const replacements = new WeakMap();
	for (const root of tree.roots) {
		const lowered = lowerBoundaryNodeAst(root, ownerRenderer, state);
		replacements.set(
			root.astNode,
			replaceBoundaryPropAst(root.astNode, root.boundary, lowered.expression),
		);
	}
	let transformedAst = mapAstCow(ast, (node) =>
		replacements.has(node) ? replacements.get(node) : undefined,
	);
	let validationRanges;
	let validationExclusions;
	if (ownerRenderer.validation !== undefined) {
		const reachable = ownerReachableComponentsAst(transformedAst, state.localSpecializations);
		validationRanges = Object.freeze([{ start: ast.start ?? 0, end: ast.end ?? source.length }]);
		validationExclusions = Object.freeze([
			...tree.roots
				.map(({ boundary }) => {
					const region = boundary.region;
					const range =
						region.kind === 'children'
							? region.range
							: region.kind === 'attribute'
								? region.attributeRange
								: null;
					return range === null ? null : { start: range[0], end: range[1] };
				})
				.filter(Boolean),
			...[...state.specializedLocalNames]
				.filter((name) => !reachable.has(name))
				.map((name) => state.localSpecializations.components.get(name)?.declaration)
				.filter(Boolean)
				.map((node) => ({ start: node.start, end: node.end })),
		]);
	}
	if (state.preludes.length > 0) {
		transformedAst = {
			...transformedAst,
			body: [...(transformedAst.body ?? []), ...state.preludes],
		};
	}
	if (ownerRenderer.target === 'dom' && state.domRegions.length > 0) {
		transformedAst = expandDomRendererRegionsAst(transformedAst, state.domRegions);
		state.domRegions = [];
	}
	return Object.freeze({
		analysis: tree.analysis,
		ast: transformedAst,
		domRegions: Object.freeze(state.domRegions),
		universalUnits: Object.freeze(state.universalUnits),
		...(ownerRenderer.validation === undefined
			? null
			: {
					validationAst: ast,
					validationExclusions,
					validationRanges,
				}),
	});
}

function serverBoundaryDiagnostic(boundary, filename, message, code) {
	const at = boundary.loc ? `${filename}:${boundary.loc.line}:${boundary.loc.column}` : filename;
	const error = new Error(
		`Octane renderer boundary ${JSON.stringify(`${boundary.moduleId}#${boundary.exportName}`)} ${message} (${at})`,
	);
	error.code = code;
	error.filename = filename;
	error.loc = boundary.loc;
	return error;
}

export function prepareServerRendererBoundaryRegions(
	source,
	filename,
	ownerRenderer,
	{ rendererBoundaries, rendererRegistry } = {},
	parsedAst = null,
) {
	const ast = parsedAst ?? parseModule(source, filename);
	const tree = analyzeBoundaryTree(source, filename, ownerRenderer, rendererBoundaries, ast);
	if (tree === null || tree.roots.length === 0) return null;
	attachBoundaryAstNodes(tree.roots, astNodeIndex(ast));

	const replacements = new WeakMap();
	for (const node of tree.roots) {
		const boundary = node.boundary;
		if (boundary.server !== 'omit-child') {
			throw serverBoundaryDiagnostic(
				boundary,
				filename,
				'cannot compile for the server because renderer-owned client regions do not provide serialization or hydration',
				'OCTANE_RENDERER_BOUNDARY_SERVER_UNSUPPORTED',
			);
		}
		const childRenderer = resolveRenderer(rendererRegistry, boundary.childRenderer, filename);
		if (childRenderer.server !== 'client-only') {
			throw serverBoundaryDiagnostic(
				boundary,
				filename,
				`declares server: "omit-child" but child renderer ${JSON.stringify(boundary.childRenderer)} is not server: "client-only"`,
				'OCTANE_RENDERER_BOUNDARY_SERVER_POLICY_MISMATCH',
			);
		}
		const element = node.astNode;
		if (boundary.region.kind === 'children') {
			replacements.set(
				element,
				inheritGeneratedOrigin(
					b.jsx_element(
						element,
						element.openingElement?.attributes ?? element.attributes ?? [],
						[],
					),
					element,
				),
			);
		} else if (boundary.region.kind === 'attribute') {
			const selected = rendererBoundaryAttribute(boundary, element);
			replacements.set(
				element,
				inheritGeneratedOrigin(
					b.jsx_element(
						element,
						(element.openingElement?.attributes ?? element.attributes ?? []).filter(
							(attribute) => attribute !== selected,
						),
						element.children ?? [],
					),
					element,
				),
			);
		}
	}
	return Object.freeze({
		analysis: tree.analysis,
		ast: mapAstCow(ast, (node) => (replacements.has(node) ? replacements.get(node) : undefined)),
	});
}
