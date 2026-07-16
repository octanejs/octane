import {
	analyzeRendererBoundaries,
	assertRendererBoundaryAnalysis,
	rendererBoundaryOwnerDiagnostic,
} from './renderer-boundaries.js';
import {
	lowerUniversalRendererRegion,
	originsFromSourceMap,
	sourceMapFromOrigins,
} from './compile-universal.js';
import { parseModule } from '@tsrx/core';

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

function analyzeBoundaryTree(source, filename, ownerRenderer, rendererBoundaries) {
	if (!rendererBoundaries || Object.keys(rendererBoundaries).length === 0) return null;
	// Analyze every declared boundary first. Ownership is semantic: a nested
	// boundary is interpreted under the renderer selected by its nearest owning
	// region, not the file's lexical default.
	const analysis = analyzeRendererBoundaries(source, {
		filename,
		rendererBoundaries,
	});
	assertRendererBoundaryAnalysis(analysis);
	const roots = buildBoundaryTree(analysis.boundaries);
	validateBoundaryOwners(roots, ownerRenderer.id, filename);
	return { analysis, roots };
}

function openingInsertOffset(source, openingRange) {
	const opening = source.slice(openingRange[0], openingRange[1]);
	const close = opening.lastIndexOf('/>');
	if (close !== -1) return openingRange[0] + close;
	const end = opening.lastIndexOf('>');
	if (end === -1) throw new Error('Octane renderer boundary has an invalid JSX opening range.');
	return openingRange[0] + end;
}

function generatedText(code) {
	const origins = new Int32Array(code.length);
	origins.fill(-1);
	return { code, origins };
}

function authoredText(source, start = 0, end = source.length) {
	const code = source.slice(start, end);
	const origins = new Int32Array(code.length);
	for (let index = 0; index < origins.length; index++) origins[index] = start + index;
	return { code, origins };
}

function concatMapped(...parts) {
	const values = parts.flat().filter((part) => part != null && part.code !== '');
	const code = values.map((part) => part.code).join('');
	const origins = new Int32Array(code.length);
	let offset = 0;
	for (const part of values) {
		origins.set(part.origins, offset);
		offset += part.code.length;
	}
	return { code, origins };
}

function mappedIdentifier(code, origin) {
	const value = generatedText(code);
	if (origin >= 0 && value.origins.length > 0) value.origins[0] = origin;
	return value;
}

function applyMappedReplacements(input, replacements) {
	const sorted = [...replacements].sort(
		(left, right) => left.start - right.start || left.end - right.end,
	);
	const parts = [];
	let cursor = 0;
	for (const replacement of sorted) {
		if (replacement.start < cursor || replacement.end > input.code.length) {
			throw new Error('Octane renderer specialization produced an overlapping rewrite.');
		}
		parts.push(
			{
				code: input.code.slice(cursor, replacement.start),
				origins: input.origins.slice(cursor, replacement.start),
			},
			replacement.value,
		);
		cursor = replacement.end;
	}
	parts.push({ code: input.code.slice(cursor), origins: input.origins.slice(cursor) });
	return concatMapped(parts);
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

function collectTagReplacements(node, cloneNames, offset = 0) {
	const replacements = [];
	walkScopedReferences(node, {
		tag(name, local) {
			if (!cloneNames.has(local)) return;
			replacements.push({
				start: name.start - offset,
				end: name.end - offset,
				name: cloneNames.get(local),
			});
		},
	});
	return replacements;
}

function collectLocalCallReplacements(node, cloneNames, offset = 0) {
	const replacements = [];
	walkScopedReferences(node, {
		call(callee, local) {
			if (!cloneNames.has(local)) return;
			replacements.push({
				start: callee.start - offset,
				end: callee.end - offset,
				name: cloneNames.get(local),
			});
		},
	});
	return replacements;
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

function collectRuntimeCallReplacements(node, runtime, aliases, offset = 0) {
	const replacements = [];
	collectRuntimeCalls(node, runtime, (callee, imported) => {
		const alias = aliases.get(imported);
		if (!alias) return;
		replacements.push({
			start: callee.start - offset,
			end: callee.end - offset,
			name: alias,
		});
	});
	return replacements;
}

function collectRuntimeCallNames(node, runtime) {
	const output = new Set();
	collectRuntimeCalls(node, runtime, (_callee, imported) => output.add(imported));
	return output;
}

function collectLocalSpecializationInfo(source, filename) {
	const ast = parseModule(source, filename);
	const components = new Map();
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
	}
	return { components, runtime };
}

function remapText(code, relativeOrigins, input) {
	const origins = new Int32Array(code.length);
	origins.fill(-1);
	for (let index = 0; index < origins.length; index++) {
		const relative = relativeOrigins[index];
		if (relative >= 0 && relative < input.origins.length) origins[index] = input.origins[relative];
	}
	return { code, origins };
}

function recordDomHostMappings(value, state) {
	for (const match of value.code.matchAll(/<([a-z][\w:-]*)\b/g)) {
		const index = match.index;
		const origin = value.origins[index];
		if (origin < 0 || value.origins[index + 1] !== origin + 1) continue;
		state.mappingNeedles.push({ code: `<${match[1]}`, offset: origin });
		state.mappingNeedles.push({ code: `'${match[1]}'`, offset: origin + 1 });
		state.mappingNeedles.push({ code: JSON.stringify(match[1]), offset: origin + 1 });
	}
}

function regionText(source, region) {
	if (region.kind === 'children') return authoredText(source, region.range[0], region.range[1]);
	if (region.kind === 'absent') return generatedText('null');
	if (region.valueKind === 'boolean') return generatedText('true');
	if (region.valueKind === 'literal') return generatedText(JSON.stringify(region.value));
	return authoredText(source, region.valueRange[0], region.valueRange[1]);
}

function regionRange(region) {
	if (region.kind === 'children') return region.range;
	if (region.kind === 'attribute' && region.valueKind === 'expression') {
		return region.valueRange;
	}
	return null;
}

function replaceBoundaryProp(source, boundary, expression, replacements) {
	const region = boundary.region;
	if (region.kind === 'children') {
		replacements.push({ start: region.range[0], end: region.range[1], value: generatedText('') });
		const offset = openingInsertOffset(source, boundary.openingRange);
		replacements.push({
			start: offset,
			end: offset,
			value: concatMapped(generatedText(` ${boundary.prop}={`), expression, generatedText('}')),
		});
		return;
	}
	if (region.kind === 'attribute' && region.valueKind === 'expression') {
		replacements.push({
			start: region.valueRange[0],
			end: region.valueRange[1],
			value: expression,
		});
		return;
	}
	if (region.kind === 'attribute') {
		replacements.push({
			start: region.attributeRange[0],
			end: region.attributeRange[1],
			value: concatMapped(generatedText(`${boundary.prop}={`), expression, generatedText('}')),
		});
		return;
	}
	const offset = openingInsertOffset(source, boundary.openingRange);
	replacements.push({
		start: offset,
		end: offset,
		value: concatMapped(generatedText(` ${boundary.prop}={`), expression, generatedText('}')),
	});
}

function applySourceReplacements(source, start, end, replacements) {
	const sorted = [...replacements].sort(
		(left, right) => left.start - right.start || left.end - right.end,
	);
	const parts = [];
	let cursor = start;
	for (const replacement of sorted) {
		if (replacement.start < cursor || replacement.end > end) {
			throw new Error('Octane renderer boundary produced an overlapping or out-of-range rewrite.');
		}
		parts.push(authoredText(source, cursor, replacement.start), replacement.value);
		cursor = replacement.end;
	}
	parts.push(authoredText(source, cursor, end));
	return concatMapped(parts);
}

function applyRegionReplacements(source, region, replacements) {
	if (replacements.length === 0) return regionText(source, region);
	const bounds = regionRange(region);
	if (bounds === null) {
		throw new Error('Octane renderer boundary found nested content in a non-expression prop.');
	}
	return applySourceReplacements(source, bounds[0], bounds[1], replacements);
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

function specializeLocalComponents(value, kind, index, state) {
	const localNames = new Set(state.localSpecializations.components.keys());
	const expressionPrefix =
		kind === 'children' ? 'const __octaneRegion = (<>' : 'const __octaneRegion = (';
	const expressionSuffix = kind === 'children' ? '</>);' : ');';
	const parsed = parseModule(`${expressionPrefix}${value.code}${expressionSuffix}`, state.filename);
	const expression = parsed.body[0]?.declarations?.[0]?.init;
	if (!expression) throw new Error('Octane renderer boundary could not inspect its child region.');

	const selected = new Set([
		...jsxComponentReferences(expression, localNames),
		...localCallReferences(expression, localNames),
	]);
	const queue = [...selected];
	while (queue.length > 0) {
		const name = queue.shift();
		const component = state.localSpecializations.components.get(name);
		if (!component) continue;
		const references = new Set([
			...jsxComponentReferences(component.declaration, localNames),
			...localCallReferences(component.declaration, localNames),
		]);
		for (const reference of references) {
			if (selected.has(reference)) continue;
			selected.add(reference);
			queue.push(reference);
		}
	}

	const prefix = `__octaneRendererRegion${index}`;
	const cloneNames = new Map();
	for (const name of selected) {
		const preferred = /^use[A-Z]/.test(name)
			? `useOctaneRendererRegion${index}${name.slice(3)}`
			: `${prefix}${name}`;
		cloneNames.set(name, state.names.name(preferred));
	}
	const runtimeNames = new Set();
	for (const imported of collectRuntimeCallNames(expression, state.localSpecializations.runtime)) {
		runtimeNames.add(imported);
	}
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

	const regionReplacements = [
		...collectTagReplacements(expression, cloneNames, expressionPrefix.length),
		...collectLocalCallReplacements(expression, cloneNames, expressionPrefix.length),
		...collectRuntimeCallReplacements(
			expression,
			state.localSpecializations.runtime,
			aliases,
			expressionPrefix.length,
		),
	]
		.filter((replacement) => replacement.start >= 0 && replacement.end <= value.code.length)
		.map((replacement) => ({
			start: replacement.start,
			end: replacement.end,
			value: mappedIdentifier(replacement.name, value.origins[replacement.start] ?? -1),
		}));
	const region = applyMappedReplacements(value, regionReplacements);

	const components = [];
	for (const name of [...selected].sort((left, right) => {
		return (
			state.localSpecializations.components.get(left).declaration.start -
			state.localSpecializations.components.get(right).declaration.start
		);
	})) {
		const component = state.localSpecializations.components.get(name);
		const replacements = [
			{
				start: component.id.start,
				end: component.id.end,
				name: cloneNames.get(name),
			},
			...collectTagReplacements(component.declaration, cloneNames),
			...collectLocalCallReplacements(component.declaration, cloneNames),
			...collectRuntimeCallReplacements(
				component.declaration,
				state.localSpecializations.runtime,
				aliases,
			),
		]
			.sort((left, right) => left.start - right.start || left.end - right.end)
			.map((replacement) => ({
				start: replacement.start,
				end: replacement.end,
				value: mappedIdentifier(replacement.name, replacement.start),
			}));
		components.push(
			concatMapped(
				generatedText('export '),
				applySourceReplacements(
					state.source,
					component.declaration.start,
					component.declaration.end,
					replacements,
				),
			),
		);
	}
	return {
		components,
		region,
		runtimeImports: [...aliases].map(([imported, local]) => ({ imported, local })),
	};
}

function lowerBoundaryNode(node, ownerRenderer, state) {
	const boundary = node.boundary;
	const childRenderer = resolveRenderer(
		state.rendererRegistry,
		boundary.childRenderer,
		state.filename,
	);
	const replacements = [];
	for (const child of node.children) {
		const lowered = lowerBoundaryNode(child, childRenderer, state);
		replaceBoundaryProp(state.source, child.boundary, lowered.expression, replacements);
	}
	const value = applyRegionReplacements(state.source, boundary.region, replacements);

	if (childRenderer.target === 'universal') {
		const index = state.names.universalIndex();
		const kind = boundary.region.kind === 'children' ? 'children' : 'expression';
		const specialization = specializeLocalComponents(value, kind, index, state);
		const lowered = lowerUniversalRendererRegion(
			specialization.region.code,
			state.filename,
			ownerRenderer.id,
			childRenderer,
			index,
			kind,
			{
				authoredSource: state.source,
				components: specialization.components,
				deferredRendererRegions: state.domRegions.filter((region) =>
					specialization.region.code.includes(region.token),
				),
				hmr: state.hmr,
				profile: state.profile,
				profileFilename: state.profileFilename,
				regionOrigins: specialization.region.origins,
				runtimeImports: specialization.runtimeImports,
			},
		);
		state.preludes.push({ code: lowered.prelude, origins: lowered.preludeOrigins });
		state.universalUnits.push(lowered.metadata);
		for (const mapping of lowered.mappings) {
			if (mapping.offset >= 0) state.mappingNeedles.push(mapping);
		}
		return {
			expression: { code: lowered.expression, origins: lowered.expressionOrigins },
		};
	}

	if (ownerRenderer.target === 'universal' && childRenderer.target === 'dom') {
		recordDomHostMappings(value, state);
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
				source: value,
				token,
			}),
		);
		return { expression: generatedText(token) };
	}

	throw new Error(
		`Octane renderer boundary ${JSON.stringify(`${boundary.moduleId}#${boundary.exportName}`)} cannot lower ${JSON.stringify(ownerRenderer.target)} -> ${JSON.stringify(childRenderer.target)} regions.`,
	);
}

/**
 * Replace renderer-owned JSX props with stable opaque region descriptors.
 * Boundary ownership is walked recursively so a DOM region may enter a
 * universal renderer, return to DOM, and enter another universal renderer.
 */
export function prepareRendererBoundaryRegions(source, filename, ownerRenderer, options = {}) {
	const { rendererBoundaries, rendererRegistry } = options;
	const tree = analyzeBoundaryTree(source, filename, ownerRenderer, rendererBoundaries);
	if (tree === null || tree.roots.length === 0) return null;

	const state = {
		domRegions: [],
		filename,
		hmr: options?.hmr === true ? 'vite' : options?.hmr || false,
		localSpecializations: collectLocalSpecializationInfo(source, filename),
		names: createNameAllocator(source),
		mappingNeedles: [],
		preludes: [],
		profile: options?.profile === true,
		profileFilename: options?.profileFilename,
		rendererRegistry,
		source,
		universalUnits: [],
	};
	const replacements = [];
	for (const root of tree.roots) {
		const lowered = lowerBoundaryNode(root, ownerRenderer, state);
		replaceBoundaryProp(source, root.boundary, lowered.expression, replacements);
	}

	let transformed = applySourceReplacements(source, 0, source.length, replacements);
	if (state.preludes.length > 0) {
		transformed = concatMapped(
			transformed,
			generatedText('\n'),
			state.preludes.flatMap((prelude, index) =>
				index === 0 ? [prelude] : [generatedText('\n'), prelude],
			),
		);
	}
	if (ownerRenderer.target === 'dom' && state.domRegions.length > 0) {
		transformed = expandDomRendererRegionsMapped(transformed, state.domRegions);
		state.domRegions = [];
	}
	return Object.freeze({
		analysis: tree.analysis,
		domRegions: Object.freeze(state.domRegions),
		map: sourceMapFromOrigins(transformed.code, transformed.origins, source, filename),
		mappingNeedles: Object.freeze(state.mappingNeedles),
		source: transformed.code,
		universalUnits: Object.freeze(state.universalUnits),
	});
}

function blankAuthoredText(source, start, end) {
	const value = authoredText(source, start, end);
	return {
		code: value.code.replace(/[^\r\n]/g, ' '),
		origins: value.origins,
	};
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

/**
 * Remove renderer-owned client regions before DOM SSR codegen.
 *
 * Replacements retain every authored newline and UTF-16 offset. Hydration keys,
 * hook locations, later diagnostics, and the composed source map therefore keep
 * the same source identity as the client compilation even when a large scene is
 * absent from the server body.
 */
export function prepareServerRendererBoundaryRegions(
	source,
	filename,
	ownerRenderer,
	{ rendererBoundaries, rendererRegistry } = {},
) {
	const tree = analyzeBoundaryTree(source, filename, ownerRenderer, rendererBoundaries);
	if (tree === null || tree.roots.length === 0) return null;

	const replacements = [];
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

		const region = boundary.region;
		let bounds = null;
		if (region.kind === 'children') bounds = region.range;
		else if (region.kind === 'attribute') bounds = region.attributeRange;
		if (bounds !== null && bounds[1] > bounds[0]) {
			replacements.push({
				start: bounds[0],
				end: bounds[1],
				value: blankAuthoredText(source, bounds[0], bounds[1]),
			});
		}
	}

	if (replacements.length === 0) {
		return Object.freeze({ analysis: tree.analysis, map: null, source });
	}
	const transformed = applySourceReplacements(source, 0, source.length, replacements);
	return Object.freeze({
		analysis: tree.analysis,
		map: sourceMapFromOrigins(transformed.code, transformed.origins, source, filename),
		source: transformed.code,
	});
}

/** Reject client-only renderer regions before server codegen can treat them as DOM. */
export function assertNoServerRendererBoundaries(
	source,
	filename,
	ownerRenderer,
	{ rendererBoundaries } = {},
) {
	const tree = analyzeBoundaryTree(source, filename, ownerRenderer, rendererBoundaries);
	if (tree === null || tree.roots.length === 0) return;
	const boundary = tree.roots[0].boundary;
	const at = boundary.loc ? `${filename}:${boundary.loc.line}:${boundary.loc.column}` : filename;
	const error = new Error(
		`Octane renderer boundary ${JSON.stringify(`${boundary.moduleId}#${boundary.exportName}`)} cannot compile for the server because renderer-owned client regions do not provide serialization or hydration. (${at})`,
	);
	error.code = 'OCTANE_RENDERER_BOUNDARY_SERVER_UNSUPPORTED';
	error.filename = filename;
	error.loc = boundary.loc;
	throw error;
}

function replaceToken(input, token, value) {
	const parts = [];
	let cursor = 0;
	let offset = input.code.indexOf(token);
	while (offset !== -1) {
		parts.push(
			{
				code: input.code.slice(cursor, offset),
				origins: input.origins.slice(cursor, offset),
			},
			value,
		);
		cursor = offset + token.length;
		offset = input.code.indexOf(token, cursor);
	}
	if (cursor === 0) return input;
	parts.push({ code: input.code.slice(cursor), origins: input.origins.slice(cursor) });
	return concatMapped(parts);
}

function expandDomRendererRegionsMapped(lowered, domRegions) {
	let output = lowered;
	const prelude = [];
	for (const region of domRegions) {
		prelude.push(
			`import { rendererRegion as ${region.helper} } from ${JSON.stringify(region.ownerRenderer.module)};`,
			`import { bindRendererRegionOwner as ${region.bind} } from "octane";`,
			`const ${region.body} = (props) => { ${region.bind}(props); return props.render(); };`,
		);
	}
	// Regions are recorded child-first. Expand parents first so any descendant
	// tokens introduced by a parent's raw DOM source are subsequently replaced.
	for (const region of [...domRegions].reverse()) {
		const render = concatMapped(
			generatedText(region.kind === 'children' ? '() => (<>' : '() => ('),
			region.source,
			generatedText(region.kind === 'children' ? '</>)' : ')'),
		);
		const expression = concatMapped(
			generatedText(
				`${region.helper}(${JSON.stringify(region.ownerRenderer.id)}, ${JSON.stringify(region.childRenderer.id)}, ` +
					`${region.body}, { render: `,
			),
			render,
			generatedText(' })'),
		);
		output = replaceToken(output, region.renderToken, render);
		output = replaceToken(output, region.token, expression);
	}
	return concatMapped(generatedText(`${prelude.join('\n')}\n`), output);
}

/** Expand reverse universal -> DOM tokens immediately before DOM compilation. */
export function expandDomRendererRegions(lowered, _ownerRenderer, domRegions, mapping) {
	if (!domRegions || domRegions.length === 0) return { source: lowered, map: mapping?.map };
	if (!mapping?.map || typeof mapping.source !== 'string') {
		throw new Error('Octane reverse renderer regions require source-map provenance.');
	}
	const input = {
		code: lowered,
		origins: originsFromSourceMap(lowered, mapping.map, mapping.source),
	};
	const expanded = expandDomRendererRegionsMapped(input, domRegions);
	return {
		source: expanded.code,
		map: sourceMapFromOrigins(expanded.code, expanded.origins, mapping.source, mapping.filename),
	};
}
