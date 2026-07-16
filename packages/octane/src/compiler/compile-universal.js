/**
 * Experimental universal-target lowering.
 *
 * This is intentionally separate from the mature DOM planner. It lowers host
 * JSX to immutable host/range/text/slot plans plus explicit component and
 * control-flow descriptors. The resulting JSX-free module is handed back
 * through the existing client hook/dependency pass, then its Octane runtime
 * import is retargeted to the selected renderer module.
 */
import { parseModule } from '@tsrx/core';
import { print as esrapPrint } from 'esrap';
import esrapTsx from 'esrap/languages/tsx';

const UNIVERSAL_RUNTIME_IMPORTS = new Set([
	'Activity',
	'createContext',
	'createPortal',
	'memo',
	'requestFormReset',
	'startTransition',
	'use',
	'useActionState',
	'useCallback',
	'useContext',
	'useDebugValue',
	'useDeferredValue',
	'useEffect',
	'useEffectEvent',
	'useFormStatus',
	'useId',
	'useImperativeHandle',
	'useInsertionEffect',
	'useLayoutEffect',
	'useMemo',
	'useOptimistic',
	'useReducer',
	'useRef',
	'useState',
	'useSyncExternalStore',
	'useTransition',
]);

function universalError(filename, node, message) {
	const start = node?.loc?.start;
	const at = start ? ` at ${filename}:${start.line}:${start.column}` : '';
	return new Error(`Octane universal compiler: ${message}${at}`);
}

function printNode(node) {
	return esrapPrint(node, esrapTsx()).code;
}

function printExpression(node) {
	return printNode({ type: 'ExpressionStatement', expression: node }).trim().replace(/;$/, '');
}

function isTemplateNode(node) {
	return (
		node?.type === 'JSXElement' ||
		node?.type === 'Element' ||
		node?.type === 'JSXFragment' ||
		node?.type === 'Fragment' ||
		node?.type === 'JSXForExpression' ||
		node?.type === 'JSXIfExpression' ||
		node?.type === 'JSXSwitchExpression' ||
		node?.type === 'JSXTryExpression'
	);
}

function compileRenderableExpression(node, state) {
	const context = { values: [] };
	const nodes = compileChild(node, context, state);
	const root = nodes.length === 1 ? nodes[0] : { kind: 'range', children: nodes };
	const plan = allocPlan(state, root);
	return `${state.helpers.value}(${plan}, [${context.values.join(', ')}])`;
}

function rewriteSourceNode(node, state) {
	if (!node || typeof node !== 'object' || typeof node.start !== 'number') return printNode(node);
	const directReplacement = state.sourceNodeReplacements?.get(node);
	if (directReplacement !== undefined) return directReplacement;
	const replacements = [];
	const seen = new WeakSet();
	const visit = (value) => {
		if (!value || typeof value !== 'object') return;
		if (Array.isArray(value)) {
			for (const child of value) visit(child);
			return;
		}
		if (seen.has(value)) return;
		seen.add(value);
		const replacement = state.sourceNodeReplacements?.get(value);
		if (value !== node && replacement !== undefined) {
			replacements.push({ start: value.start, end: value.end, code: replacement });
			return;
		}
		if (value !== node && isTemplateNode(value)) {
			replacements.push({
				start: value.start,
				end: value.end,
				code: compileRenderableExpression(value, state),
			});
			return;
		}
		for (const [key, child] of Object.entries(value)) {
			if (key === 'loc' || key === 'start' || key === 'end' || key === 'metadata') continue;
			visit(child);
		}
	};
	visit(node);
	let code = state.source.slice(node.start, node.end);
	for (const replacement of replacements.sort((left, right) => right.start - left.start)) {
		code =
			code.slice(0, replacement.start - node.start) +
			replacement.code +
			code.slice(replacement.end - node.start);
	}
	return code;
}

function extractEntryParallelUses(expression, state) {
	const useAliases = new Set(
		[...state.runtimeImports].filter(([, imported]) => imported === 'use').map(([local]) => local),
	);
	if (useAliases.size === 0) return [];
	const calls = [];
	const seen = new WeakSet();
	const visit = (node) => {
		if (!node || typeof node !== 'object') return;
		if (Array.isArray(node)) {
			for (const child of node) visit(child);
			return;
		}
		if (seen.has(node)) return;
		seen.add(node);
		if (
			node !== expression &&
			(node.type === 'FunctionDeclaration' ||
				node.type === 'FunctionExpression' ||
				node.type === 'ArrowFunctionExpression')
		) {
			return;
		}
		// These constructs own conditional/per-item/error regions. Hoisting a use()
		// out of them would change which owner catches suspension or whether the
		// call executes. Their normal body compilers retain the authored placement.
		if (
			node.type === 'JSXIfExpression' ||
			node.type === 'JSXSwitchExpression' ||
			node.type === 'JSXForExpression' ||
			node.type === 'JSXTryExpression' ||
			node.type === 'ConditionalExpression' ||
			(node.type === 'LogicalExpression' && (node.operator === '&&' || node.operator === '||'))
		) {
			return;
		}
		if (
			node.type === 'CallExpression' &&
			node.callee?.type === 'Identifier' &&
			useAliases.has(node.callee.name)
		) {
			calls.push(node);
			return;
		}
		for (const [key, child] of Object.entries(node)) {
			if (key === 'loc' || key === 'start' || key === 'end' || key === 'metadata') continue;
			visit(child);
		}
	};
	visit(expression);
	calls.sort((left, right) => left.start - right.start);
	state.sourceNodeReplacements ??= new WeakMap();
	return calls.map((call, index) => {
		const code = printDynamicExpression(call, state);
		const name = allocName(state, `${state.planPrefix}EntryUse${index}`);
		state.sourceNodeReplacements.set(call, name);
		return `const ${name} = ${code};`;
	});
}

function printDynamicExpression(node, state) {
	const code = rewriteSourceNode(node, state);
	recordMapping(state, code, node);
	return code;
}

function recordMapping(state, code, node) {
	const loc = node?.loc?.start;
	if (!loc || code === '') return;
	state.mappingNeedles?.push({
		code,
		line: loc.line - 1,
		column: loc.column | 0,
		offset: typeof node.start === 'number' ? node.start : undefined,
	});
}

function assertNoResidualTemplate(node, state, context) {
	if (node == null || typeof node !== 'object') return;
	if (Array.isArray(node)) {
		for (const child of node) assertNoResidualTemplate(child, state, context);
		return;
	}
	if (
		typeof node.type === 'string' &&
		(node.type.startsWith('JSX') || node.type === 'Element' || node.type === 'Fragment')
	) {
		throw universalError(
			state.filename,
			node,
			`JSX in ${context} requires universal plan lowering and cannot fall back to DOM codegen.`,
		);
	}
	for (const [key, value] of Object.entries(node)) {
		if (key === 'loc' || key === 'start' || key === 'end') continue;
		assertNoResidualTemplate(value, state, context);
	}
}

function validateRuntimeImports(ast, state) {
	for (const node of ast.body ?? []) {
		if (node.type !== 'ImportDeclaration' || node.source?.value !== 'octane') continue;
		if (node.importKind === 'type') continue;
		for (const specifier of node.specifiers ?? []) {
			if (specifier.importKind === 'type') continue;
			if (specifier.type !== 'ImportSpecifier') {
				throw universalError(
					state.filename,
					specifier,
					'universal renderer modules require named imports from octane.',
				);
			}
			const imported = specifier.imported?.name ?? specifier.imported?.value;
			if (specifier.local?.name) state.runtimeImports.set(specifier.local.name, imported);
			if (!UNIVERSAL_RUNTIME_IMPORTS.has(imported)) {
				throw universalError(
					state.filename,
					specifier,
					`runtime import ${JSON.stringify(imported)} has no universal renderer implementation.`,
				);
			}
		}
	}
}

function collectAuthoredHookSites(fn, state) {
	const sites = [];
	const seen = new WeakSet();
	const visit = (node) => {
		if (!node || typeof node !== 'object') return;
		if (Array.isArray(node)) {
			for (const child of node) visit(child);
			return;
		}
		if (seen.has(node)) return;
		seen.add(node);
		if (
			node !== fn &&
			(node.type === 'FunctionDeclaration' ||
				node.type === 'FunctionExpression' ||
				node.type === 'ArrowFunctionExpression')
		) {
			return;
		}
		if (node.type === 'CallExpression') {
			let name = null;
			if (node.callee?.type === 'Identifier') {
				name = state.runtimeImports.get(node.callee.name) ?? node.callee.name;
			} else if (
				node.callee?.type === 'MemberExpression' &&
				!node.callee.computed &&
				node.callee.property?.type === 'Identifier'
			) {
				name = node.callee.property.name;
			}
			if (name === 'use' || name === 'useContext' || /^use[A-Z]/.test(name ?? '')) {
				if (node.callee?.type === 'Identifier') {
					recordMapping(state, node.callee.name, node.callee);
				}
				const loc = node.loc?.start;
				sites.push({
					name,
					line: loc?.line ?? 0,
					column: loc?.column ?? 0,
				});
			}
		}
		for (const [key, child] of Object.entries(node)) {
			if (key === 'loc' || key === 'start' || key === 'end' || key === 'metadata') continue;
			visit(child);
		}
	};
	visit(fn.body);
	return sites;
}

function jsxName(node) {
	const name = node?.openingElement?.name ?? node?.name;
	return name?.type === 'JSXIdentifier' ? name.name : null;
}

function attributeName(attribute) {
	return attribute?.name?.type === 'JSXIdentifier' ? attribute.name.name : null;
}

function jsxNameExpression(node, state) {
	const name = node?.openingElement?.name ?? node?.name;
	if (name?.type === 'JSXIdentifier' || name?.type === 'Identifier') return name.name;
	if (name?.type === 'JSXMemberExpression' || name?.type === 'MemberExpression') {
		const object = jsxNameExpression({ name: name.object }, state);
		const property = jsxNameExpression({ name: name.property }, state);
		return `${object}.${property}`;
	}
	if (name?.type === 'JSXExpressionContainer') {
		assertNoResidualTemplate(name.expression, state, 'a dynamic component name');
		return `(${printExpression(name.expression)})`;
	}
	throw universalError(state.filename, node, 'unsupported JSX tag name.');
}

function contextProviderExpression(node, state) {
	const name = node?.openingElement?.name ?? node?.name;
	if (
		(name?.type === 'JSXMemberExpression' || name?.type === 'MemberExpression') &&
		(name.property?.name ?? name.property?.value) === 'Provider'
	) {
		return jsxNameExpression({ name: name.object }, state);
	}
	return null;
}

function isComponentElement(node) {
	const name = node?.openingElement?.name ?? node?.name;
	if (name?.type === 'JSXMemberExpression' || name?.type === 'MemberExpression') return true;
	if (name?.type === 'JSXExpressionContainer') return true;
	const value = name?.name;
	return typeof value === 'string' && !/^[a-z]/.test(value) && !value.includes('-');
}

function collectComponentNames(ast) {
	const names = new Set();
	const seen = new WeakSet();
	const visit = (node) => {
		if (!node || typeof node !== 'object') return;
		if (Array.isArray(node)) {
			for (const child of node) visit(child);
			return;
		}
		if (seen.has(node)) return;
		seen.add(node);
		if ((node.type === 'JSXElement' || node.type === 'Element') && isComponentElement(node)) {
			const name = node.openingElement?.name ?? node.name;
			if (name?.type === 'JSXIdentifier' || name?.type === 'Identifier') names.add(name.name);
		}
		for (const [key, value] of Object.entries(node)) {
			if (key === 'loc' || key === 'start' || key === 'end' || key === 'metadata') continue;
			visit(value);
		}
	};
	visit(ast);
	return names;
}

function addPatternNames(pattern, names) {
	if (!pattern) return;
	if (pattern.type === 'Identifier') {
		names.add(pattern.name);
		return;
	}
	if (pattern.type === 'RestElement') {
		addPatternNames(pattern.argument, names);
		return;
	}
	if (pattern.type === 'AssignmentPattern') {
		addPatternNames(pattern.left, names);
		return;
	}
	if (pattern.type === 'ArrayPattern') {
		for (const element of pattern.elements ?? []) addPatternNames(element, names);
		return;
	}
	if (pattern.type === 'ObjectPattern') {
		for (const property of pattern.properties ?? []) {
			addPatternNames(property.argument ?? property.value, names);
		}
	}
}

function collectEntryCaptures(expression, excluded) {
	const found = new Map();
	const visit = (node, bound, parent = null, key = null) => {
		if (!node || typeof node !== 'object') return;
		if (Array.isArray(node)) {
			for (const child of node) visit(child, bound, parent, key);
			return;
		}
		if (node.type === 'Identifier') {
			if (
				!bound.has(node.name) &&
				!excluded.has(node.name) &&
				!(parent?.type === 'MemberExpression' && key === 'property' && !parent.computed) &&
				!(parent?.type === 'Property' && key === 'key' && !parent.computed && !parent.shorthand)
			) {
				const entry = found.get(node.name) ?? { offset: Infinity, nodes: [] };
				entry.offset = Math.min(entry.offset, node.start ?? Infinity);
				entry.nodes.push(node);
				found.set(node.name, entry);
			}
			return;
		}
		if (node.type === 'JSXElement' || node.type === 'Element') {
			for (const attribute of node.openingElement?.attributes ?? node.attributes ?? []) {
				if (attribute.type === 'JSXSpreadAttribute' || attribute.type === 'SpreadAttribute') {
					visit(attribute.argument, bound, attribute, 'argument');
				} else if (attribute.value?.type === 'JSXExpressionContainer') {
					visit(attribute.value.expression, bound, attribute.value, 'expression');
				}
			}
			visit(node.children, bound, node, 'children');
			return;
		}
		if (node.type === 'JSXFragment' || node.type === 'Fragment') {
			visit(node.children, bound, node, 'children');
			return;
		}
		if (
			node.type === 'FunctionDeclaration' ||
			node.type === 'FunctionExpression' ||
			node.type === 'ArrowFunctionExpression'
		) {
			const inner = new Set(bound);
			if (node.id) addPatternNames(node.id, inner);
			for (const parameter of node.params ?? []) addPatternNames(parameter, inner);
			visit(node.body, inner, node, 'body');
			return;
		}
		if (node.type === 'VariableDeclaration') {
			const inner = new Set(bound);
			for (const declaration of node.declarations ?? []) addPatternNames(declaration.id, inner);
			for (const declaration of node.declarations ?? []) {
				visit(declaration.init, inner, declaration, 'init');
			}
			return;
		}
		if (node.type === 'ForOfStatement' || node.type === 'ForInStatement') {
			visit(node.right, bound, node, 'right');
			const inner = new Set(bound);
			if (node.left?.type === 'VariableDeclaration') {
				for (const declaration of node.left.declarations ?? [])
					addPatternNames(declaration.id, inner);
			} else addPatternNames(node.left, inner);
			visit(node.body, inner, node, 'body');
			return;
		}
		for (const [childKey, child] of Object.entries(node)) {
			if (
				childKey === 'loc' ||
				childKey === 'start' ||
				childKey === 'end' ||
				childKey === 'metadata'
			) {
				continue;
			}
			visit(child, bound, node, childKey);
		}
	};
	visit(expression, new Set());
	return [...found]
		.sort((left, right) => left[1].offset - right[1].offset)
		.map(([source, entry]) => ({ source, nodes: entry.nodes }));
}

function collectIdentifierNodes(root, names) {
	const output = new Map([...names].map((name) => [name, []]));
	const seen = new WeakSet();
	const visit = (node) => {
		if (!node || typeof node !== 'object') return;
		if (Array.isArray(node)) {
			for (const child of node) visit(child);
			return;
		}
		if (seen.has(node)) return;
		seen.add(node);
		if (node.type === 'Identifier' && output.has(node.name)) output.get(node.name).push(node);
		for (const [key, child] of Object.entries(node)) {
			if (key === 'loc' || key === 'start' || key === 'end' || key === 'metadata') continue;
			visit(child);
		}
	};
	visit(root);
	return output;
}

function normalizeJsxText(value) {
	const lines = String(value).replace(/\r/g, '').split('\n');
	let output = '';
	for (let index = 0; index < lines.length; index++) {
		const line = lines[index].replace(/\t/g, ' ');
		const text = index === 0 ? line.replace(/\s+$/g, '') : line.trim();
		if (text === '') continue;
		if (output !== '' && !output.endsWith(' ')) output += ' ';
		output += text;
	}
	return output;
}

function allocName(state, preferred) {
	let name = preferred;
	while (state.source.includes(name) || state.names.has(name)) name += '$';
	state.names.add(name);
	return name;
}

function addDynamic(context, expression) {
	const slot = context.values.length;
	context.values.push(expression);
	return { kind: 'slot', slot };
}

function compileProps(attributes, childrenExpression, state) {
	const entries = [];
	for (const attribute of attributes) {
		if (attribute.type === 'JSXSpreadAttribute' || attribute.type === 'SpreadAttribute') {
			entries.push(`['spread', (${printDynamicExpression(attribute.argument, state)})]`);
			continue;
		}
		const name = attributeName(attribute);
		if (name === null) {
			throw universalError(state.filename, attribute, 'namespaced JSX attributes are unsupported.');
		}
		const value = attribute.value;
		if (value == null) {
			entries.push(`['set', ${JSON.stringify(name)}, true]`);
			continue;
		}
		if (value.type === 'Literal') {
			entries.push(`['set', ${JSON.stringify(name)}, ${JSON.stringify(value.value)}]`);
			continue;
		}
		if (value.type === 'JSXExpressionContainer') {
			if (!value.expression || value.expression.type === 'JSXEmptyExpression') continue;
			entries.push(
				`['set', ${JSON.stringify(name)}, (${printDynamicExpression(value.expression, state)})]`,
			);
			continue;
		}
		throw universalError(state.filename, attribute, `unsupported value for JSX attribute ${name}.`);
	}
	return `${state.helpers.props}([${entries.join(', ')}]${
		childrenExpression === null ? '' : `, ${childrenExpression}`
	})`;
}

function compilePlainPropsObject(attributes, state) {
	const entries = [];
	for (const attribute of attributes) {
		if (attribute.type === 'JSXSpreadAttribute' || attribute.type === 'SpreadAttribute') {
			entries.push(`...(${printDynamicExpression(attribute.argument, state)})`);
			continue;
		}
		const name = attributeName(attribute);
		if (name === null) continue;
		const value = attribute.value;
		if (value == null) entries.push(`${JSON.stringify(name)}: true`);
		else if (value.type === 'Literal') {
			entries.push(`${JSON.stringify(name)}: ${JSON.stringify(value.value)}`);
		} else if (value.type === 'JSXExpressionContainer') {
			if (!value.expression || value.expression.type === 'JSXEmptyExpression') continue;
			entries.push(`${JSON.stringify(name)}: (${printDynamicExpression(value.expression, state)})`);
		}
	}
	return `{ ${entries.join(', ')} }`;
}

function compileAttribute(attribute, context, state) {
	if (attribute.type === 'JSXSpreadAttribute' || attribute.type === 'SpreadAttribute') {
		throw universalError(
			state.filename,
			attribute,
			'host spreads require the ordered universal prop program.',
		);
	}
	const name = attributeName(attribute);
	if (name === null) {
		throw universalError(state.filename, attribute, 'namespaced host attributes are unsupported.');
	}
	if (name === 'key') return null;
	const value = attribute.value;
	if (value == null) return { name, staticValue: true };
	if (value.type === 'Literal') return { name, staticValue: value.value };
	if (value.type === 'JSXExpressionContainer') {
		if (!value.expression || value.expression.type === 'JSXEmptyExpression') return null;
		const slot = context.values.length;
		context.values.push(printDynamicExpression(value.expression, state));
		return { name, slot };
	}
	throw universalError(state.filename, attribute, `unsupported value for host attribute ${name}.`);
}

function compileHostElement(node, context, state) {
	const type = jsxName(node);
	if (type === 'Activity') {
		return compileActivityElement(node, context, state);
	}
	if (isComponentElement(node)) return compileComponentElement(node, context, state);
	if (type === null) {
		throw universalError(
			state.filename,
			node,
			'member-expression and namespaced host tags are unsupported.',
		);
	}
	if (!/^[a-z]/.test(type)) return compileComponentElement(node, context, state);
	recordMapping(state, JSON.stringify(type), node.openingElement?.name ?? node.name ?? node);
	const attributes = node.openingElement?.attributes ?? node.attributes ?? [];
	const needsOrderedProps =
		attributes.some(
			(attribute) =>
				attribute.type === 'JSXSpreadAttribute' ||
				attribute.type === 'SpreadAttribute' ||
				attributeName(attribute) === 'key' ||
				attributeName(attribute) === 'children',
		) ||
		new Set(attributes.map(attributeName).filter(Boolean)).size !==
			attributes.filter((attribute) => attributeName(attribute) !== null).length;
	const props = {};
	const bindings = [];
	let propsSlot = null;
	if (needsOrderedProps) {
		propsSlot = context.values.length;
		context.values.push(compileProps(attributes, null, state));
	} else {
		for (const attribute of attributes) {
			const compiled = compileAttribute(attribute, context, state);
			if (compiled === null) continue;
			if ('slot' in compiled) bindings.push([compiled.name, compiled.slot]);
			else props[compiled.name] = compiled.staticValue;
		}
	}
	const children = compileChildren(node.children ?? [], context, state);
	return {
		kind: 'host',
		type,
		...(Object.keys(props).length === 0 ? null : { props }),
		...(bindings.length === 0 ? null : { bindings }),
		...(propsSlot === null ? null : { propsSlot }),
		...(children.length === 0 ? null : { children }),
	};
}

function rendererHasCapability(state, capability) {
	return Array.isArray(state.renderer.capabilities)
		? state.renderer.capabilities.includes(capability)
		: false;
}

function compileActivityElement(node, context, state) {
	if (!rendererHasCapability(state, 'visibility')) {
		throw universalError(
			state.filename,
			node,
			'Activity requires an explicit renderer visibility capability.',
		);
	}
	const attributes = node.openingElement?.attributes ?? node.attributes ?? [];
	let mode = null;
	for (const attribute of attributes) {
		if (attribute.type === 'JSXSpreadAttribute' || attribute.type === 'SpreadAttribute') {
			throw universalError(
				state.filename,
				attribute,
				'Activity props must declare mode explicitly; spreads are unsupported.',
			);
		}
		const name = attributeName(attribute);
		if (name !== 'mode') {
			throw universalError(
				state.filename,
				attribute,
				`Activity does not support the ${JSON.stringify(name)} prop in universal content.`,
			);
		}
		if (mode !== null) {
			throw universalError(state.filename, attribute, 'Activity mode may be declared only once.');
		}
		const value = attribute.value;
		if (value?.type === 'Literal') {
			if (value.value !== 'visible' && value.value !== 'hidden') {
				throw universalError(
					state.filename,
					attribute,
					'Activity mode must be either "visible" or "hidden".',
				);
			}
			mode = JSON.stringify(value.value);
		} else if (
			value?.type === 'JSXExpressionContainer' &&
			value.expression &&
			value.expression.type !== 'JSXEmptyExpression'
		) {
			mode = printDynamicExpression(value.expression, state);
		} else {
			throw universalError(
				state.filename,
				attribute,
				'Activity mode must be "visible", "hidden", or an expression producing one.',
			);
		}
	}
	if (mode === null) {
		throw universalError(state.filename, node, 'Activity requires an explicit mode prop.');
	}
	const body = compileBlockValue(node.children ?? [], state);
	return addDynamic(context, `${state.helpers.activity}(${mode}, ${body})`);
}

function compileComponentElement(node, context, state) {
	const component = jsxNameExpression(node, state);
	const providerContext = contextProviderExpression(node, state);
	const childNodes = node.children ?? [];
	let childrenExpression = null;
	if (
		childNodes.some((child) => child.type !== 'JSXText' || normalizeJsxText(child.value) !== '')
	) {
		const body = compileBlockValue(childNodes, state);
		childrenExpression = `${state.helpers.children}(${JSON.stringify(state.renderer.id)}, ${body})`;
	}
	const attributes = node.openingElement?.attributes ?? node.attributes ?? [];
	if (providerContext !== null) {
		const propsObject = compilePlainPropsObject(attributes, state);
		return addDynamic(
			context,
			`((__octaneContextProps) => ${state.helpers.context}(${providerContext}, __octaneContextProps.value, ${
				childrenExpression ?? '__octaneContextProps.children'
			}))(${propsObject})`,
		);
	}
	const props = compileProps(attributes, childrenExpression, state);
	return addDynamic(
		context,
		`${state.helpers.nestedComponent}(${JSON.stringify(state.renderer.id)}, ${component}, ${props})`,
	);
}

function compileBlockValue(statements, state, params = '') {
	const context = { values: [] };
	const templates = [];
	const setup = [];
	for (const statement of statements ?? []) {
		if (
			statement.type === 'JSXElement' ||
			statement.type === 'Element' ||
			statement.type === 'JSXFragment' ||
			statement.type === 'Fragment' ||
			statement.type === 'JSXText' ||
			statement.type === 'JSXExpressionContainer' ||
			statement.type === 'JSXForExpression' ||
			statement.type === 'JSXIfExpression' ||
			statement.type === 'JSXSwitchExpression' ||
			statement.type === 'JSXTryExpression'
		) {
			templates.push(...compileChild(statement, context, state));
		} else {
			setup.push(statement);
		}
	}
	const rewrittenSetup = rewriteSetupStatements(setup, state).map((entry) => entry.code);
	const root = templates.length === 1 ? templates[0] : { kind: 'range', children: templates };
	const plan = allocPlan(state, root);
	return `(${params}) => {${rewrittenSetup.length === 0 ? '' : `\n${rewrittenSetup.join('\n')}\n`}return ${
		state.helpers.value
	}(${plan}, [${context.values.join(', ')}]);}`;
}

function nestedFunctionComponent(statement, state) {
	if (statement?.type !== 'FunctionDeclaration') return null;
	const name = functionName(statement);
	if (
		statement.body?.type !== 'JSXCodeBlock' &&
		!hasOwnTemplateReturn(statement) &&
		!state.componentNames.has(name)
	) {
		return null;
	}
	return emitComponent({ fn: statement, name, exportKind: null }, state.source, state);
}

function rewriteSetupStatements(statements, state) {
	const hoisted = [];
	const body = [];
	for (const statement of statements ?? []) {
		const component = nestedFunctionComponent(statement, state);
		const entry = {
			code: component ?? rewriteSetupStatement(statement, state),
			node: statement,
		};
		// Function declarations are hoisted by JavaScript. Their universal brand
		// must therefore exist before any earlier return path can materialize one.
		// Function-valued const/let declarations intentionally retain lexical order.
		if (component === null) body.push(entry);
		else hoisted.push(entry);
	}
	return [...hoisted, ...body];
}

function rewriteSetupStatement(statement, state) {
	const declaration = nestedFunctionComponent(statement, state);
	if (declaration !== null) return declaration;
	const variable = singleFunctionDeclarator(statement, state);
	if (
		variable !== null &&
		(variable.fn.body?.type === 'JSXCodeBlock' ||
			hasOwnTemplateReturn(variable.fn) ||
			state.componentNames.has(variable.name))
	) {
		return emitComponent({ ...variable, exportKind: null }, state.source, state);
	}
	return rewriteSourceNode(statement, state);
}

function compileFor(node, context, state) {
	if (node.await) {
		throw universalError(
			state.filename,
			node,
			'await @for requires the async-collection capability.',
		);
	}
	if (!node.key) {
		throw universalError(state.filename, node, 'universal @for ranges require an explicit key.');
	}
	const declaration = node.left?.declarations?.[0];
	if (!declaration?.id) {
		throw universalError(state.filename, node, 'universal @for requires one item binding.');
	}
	const itemBinding = printNode(declaration.id);
	const indexBinding = node.index?.name ?? allocName(state, '__octaneUniversalIndex');
	assertNoResidualTemplate(node.right, state, '@for source');
	assertNoResidualTemplate(node.key, state, '@for key');
	const source = printExpression(node.right);
	const key = printExpression(node.key);
	const body = compileBlockValue(node.body?.body ?? [], state, `${itemBinding}, ${indexBinding}`);
	const empty = node.empty ? compileBlockValue(node.empty?.body ?? [], state) : null;
	const expression = `${state.helpers.for}(${source}, (${itemBinding}, ${indexBinding}) => (${key}), ${body}${
		empty === null ? '' : `, ${empty}`
	})`;
	return addDynamic(context, expression);
}

function compileIf(node, context, state) {
	assertNoResidualTemplate(node.test, state, '@if condition');
	const consequent = compileBlockValue(node.consequent?.body ?? [node.consequent], state);
	let alternate = null;
	if (node.alternate) {
		alternate =
			node.alternate.type === 'JSXIfExpression'
				? `() => ${compileIfValue(node.alternate, state)}`
				: compileBlockValue(node.alternate?.body ?? [node.alternate], state);
	}
	return addDynamic(
		context,
		`${state.helpers.if}(${printExpression(node.test)}, ${consequent}${
			alternate === null ? '' : `, ${alternate}`
		})`,
	);
}

function compileIfValue(node, state) {
	const context = { values: [] };
	const slot = compileIf(node, context, state);
	return context.values[slot.slot];
}

function compileSwitch(node, context, state) {
	assertNoResidualTemplate(node.discriminant, state, '@switch discriminant');
	const cases = [];
	let fallback = null;
	for (const item of node.cases ?? []) {
		const thunk = compileBlockValue(item.consequent ?? [], state);
		if (item.test == null) fallback = thunk;
		else {
			assertNoResidualTemplate(item.test, state, '@case expression');
			cases.push(`[(${printExpression(item.test)}), ${thunk}]`);
		}
	}
	return addDynamic(
		context,
		`${state.helpers.switch}(${printExpression(node.discriminant)}, [${cases.join(', ')}]${
			fallback === null ? '' : `, ${fallback}`
		})`,
	);
}

function compileTry(node, context, state) {
	const body = compileBlockValue(node.block?.body ?? [], state);
	const pending = node.pending ? compileBlockValue(node.pending.body ?? [], state) : null;
	let caught = null;
	if (node.handler) {
		const names = [node.handler.param?.name, node.handler.resetParam?.name]
			.filter(Boolean)
			.join(', ');
		caught = compileBlockValue(node.handler.body?.body ?? [], state, names);
	}
	return addDynamic(
		context,
		`${state.helpers.try}(${body}, ${pending ?? 'null'}, ${caught ?? 'null'})`,
	);
}

function compileChild(node, context, state) {
	if (node == null) return [];
	if (node.type === 'JSXText') {
		const value = normalizeJsxText(node.value);
		if (value === '') return [];
		if (state.renderer.text === 'ignore') return [];
		if (state.renderer.text !== 'host') {
			throw universalError(
				state.filename,
				node,
				`renderer ${JSON.stringify(state.renderer.id)} rejects authored text children.`,
			);
		}
		return [{ kind: 'text', value }];
	}
	if (node.type === 'JSXExpressionContainer') {
		if (!node.expression || node.expression.type === 'JSXEmptyExpression') return [];
		return [addDynamic(context, printDynamicExpression(node.expression, state))];
	}
	if (node.type === 'JSXElement' || node.type === 'Element') {
		return [compileHostElement(node, context, state)];
	}
	if (node.type === 'JSXFragment' || node.type === 'Fragment') {
		return [{ kind: 'range', children: compileChildren(node.children ?? [], context, state) }];
	}
	if (node.type === 'JSXForExpression') return [compileFor(node, context, state)];
	if (node.type === 'JSXIfExpression') return [compileIf(node, context, state)];
	if (node.type === 'JSXSwitchExpression') return [compileSwitch(node, context, state)];
	if (node.type === 'JSXTryExpression') return [compileTry(node, context, state)];
	if (node.type === 'JSXStyleElement') {
		throw universalError(
			state.filename,
			node,
			'scoped <style> requires a renderer style/assets capability.',
		);
	}
	if (node.type === 'JSXActivityExpression') {
		throw universalError(state.filename, node, 'unsupported Activity expression shape.');
	}
	throw universalError(state.filename, node, `unsupported template node ${node.type}.`);
}

function compileChildren(children, context, state) {
	const output = [];
	for (const child of children) output.push(...compileChild(child, context, state));
	return output;
}

function allocPlan(state, root) {
	const name = allocName(
		state,
		state.planPrefix
			? `${state.planPrefix}Plan${state.plans.length}`
			: `__octaneUniversalPlan${state.plans.length}`,
	);
	state.plans.push({ name, root });
	return name;
}

function functionName(node) {
	return node?.id?.name ?? null;
}

function singleFunctionDeclarator(node, state) {
	if (node?.type !== 'VariableDeclaration' || node.declarations?.length !== 1) return null;
	const declaration = node.declarations[0];
	if (declaration.id?.type !== 'Identifier') return null;
	if (
		declaration.init?.type === 'ArrowFunctionExpression' ||
		declaration.init?.type === 'FunctionExpression'
	) {
		return { fn: declaration.init, name: declaration.id.name, binding: declaration.id };
	}
	const call = declaration.init;
	if (
		call?.type !== 'CallExpression' ||
		call.callee?.type !== 'Identifier' ||
		(state.runtimeImports.get(call.callee.name) ?? call.callee.name) !== 'memo'
	) {
		return null;
	}
	const fn = call.arguments?.[0];
	if (fn?.type !== 'ArrowFunctionExpression' && fn?.type !== 'FunctionExpression') return null;
	return {
		fn,
		name: declaration.id.name,
		binding: declaration.id,
		wrapper: {
			callee: call.callee,
			arguments: call.arguments.slice(1),
		},
	};
}

function componentShape(node, state) {
	if (node.type === 'FunctionDeclaration') {
		return { fn: node, name: functionName(node), binding: node.id, exportKind: null };
	}
	const variable = singleFunctionDeclarator(node, state);
	if (variable !== null) return { ...variable, exportKind: null };
	if (node.type === 'ExportNamedDeclaration' && node.declaration?.type === 'FunctionDeclaration') {
		return {
			fn: node.declaration,
			name: functionName(node.declaration),
			binding: node.declaration.id,
			exportKind: 'named',
		};
	}
	if (node.type === 'ExportNamedDeclaration') {
		const exportedVariable = singleFunctionDeclarator(node.declaration, state);
		if (exportedVariable !== null) return { ...exportedVariable, exportKind: 'named' };
	}
	if (
		node.type === 'ExportDefaultDeclaration' &&
		node.declaration?.type === 'FunctionDeclaration'
	) {
		return {
			fn: node.declaration,
			name: functionName(node.declaration),
			binding: node.declaration.id,
			exportKind: 'default',
		};
	}
	if (
		node.type === 'ExportDefaultDeclaration' &&
		(node.declaration?.type === 'ArrowFunctionExpression' ||
			node.declaration?.type === 'FunctionExpression')
	) {
		return {
			fn: node.declaration,
			name: node.declaration.id?.name ?? null,
			exportKind: 'default',
		};
	}
	return null;
}

function hasOwnTemplateReturn(fn) {
	let found = false;
	const seen = new WeakSet();
	const returnContainsTemplate = (node) => {
		let contains = false;
		const visited = new WeakSet();
		const visitReturn = (value) => {
			if (contains || !value || typeof value !== 'object') return;
			if (Array.isArray(value)) {
				for (const child of value) visitReturn(child);
				return;
			}
			if (visited.has(value)) return;
			visited.add(value);
			if (isTemplateNode(value)) {
				contains = true;
				return;
			}
			if (
				value.type === 'FunctionDeclaration' ||
				value.type === 'FunctionExpression' ||
				value.type === 'ArrowFunctionExpression'
			) {
				return;
			}
			for (const [key, child] of Object.entries(value)) {
				if (key === 'loc' || key === 'start' || key === 'end' || key === 'metadata') continue;
				visitReturn(child);
			}
		};
		visitReturn(node);
		return contains;
	};
	const visit = (node, nested = false) => {
		if (found || !node || typeof node !== 'object') return;
		if (Array.isArray(node)) {
			for (const child of node) visit(child, nested);
			return;
		}
		if (seen.has(node)) return;
		seen.add(node);
		if (
			node !== fn &&
			(node.type === 'FunctionDeclaration' ||
				node.type === 'FunctionExpression' ||
				node.type === 'ArrowFunctionExpression')
		) {
			return;
		}
		if (node.type === 'ReturnStatement' && node.argument && returnContainsTemplate(node.argument)) {
			found = true;
			return;
		}
		for (const [key, value] of Object.entries(node)) {
			if (key === 'loc' || key === 'start' || key === 'end' || key === 'metadata') continue;
			visit(value, nested);
		}
	};
	visit(fn.body);
	return found;
}

function componentRender(fn, state, force = false) {
	if (fn.async || fn.generator) {
		throw universalError(
			state.filename,
			fn,
			'async/generator component functions are not supported yet.',
		);
	}
	if (fn.body?.type === 'JSXCodeBlock') {
		return {
			setup: fn.body.body ?? [],
			render: fn.body.render,
		};
	}
	if (fn.body?.type !== 'BlockStatement') {
		if (!force && !isTemplateNode(fn.body)) return null;
		return { setup: [], render: isTemplateNode(fn.body) ? fn.body : null, expression: fn.body };
	}
	if (!force && !hasOwnTemplateReturn(fn) && !state.componentNames.has(functionName(fn)))
		return null;
	return { setup: fn.body.body ?? [], render: null };
}

function emitComponent(shape, source, state) {
	const { fn, exportKind } = shape;
	const exportedComponentName = shape.name ?? fn.id?.name;
	const force =
		state.componentNames.has(exportedComponentName) ||
		exportKind === 'default' ||
		(exportKind === 'named' && /^[A-Z]/.test(exportedComponentName ?? ''));
	const render = componentRender(fn, state, force);
	if (render === null) return null;
	let name = shape.name ?? fn.id?.name;
	if (!name) name = allocName(state, '__octaneUniversalDefault');
	const loc = fn.loc?.start;
	state.components.push({
		name,
		exportKind,
		line: loc?.line ?? 0,
		column: loc?.column ?? 0,
		hooks: collectAuthoredHookSites(fn, state),
	});
	for (const parameter of fn.params ?? []) {
		assertNoResidualTemplate(parameter, state, 'component parameters');
	}
	const originalHeader =
		fn.type === 'FunctionDeclaration' && fn.id
			? source.slice(fn.start, fn.body.start)
			: `function ${name}(${(fn.params ?? []).map((param) => printNode(param)).join(', ')}) `;
	recordMapping(state, `function ${name}`, fn);
	recordMapping(state, name, shape.binding ?? fn.id ?? fn);
	const setup = rewriteSetupStatements(render.setup, state)
		.map((entry) => {
			recordMapping(state, entry.code, entry.node);
			return entry.code;
		})
		.join('\n');
	let finalReturn = '';
	if (render.render !== null) {
		finalReturn = `return ${compileRenderableExpression(render.render, state)};`;
	} else if (render.expression !== undefined) {
		finalReturn = `return ${rewriteSourceNode(render.expression, state)};`;
	}
	const body = `${originalHeader}{\n${setup}${setup === '' ? '' : '\n'}${finalReturn}\n}`;
	let wrapped =
		`${state.helpers.component}(${JSON.stringify(state.renderer.id)}, ${body}, ` +
		`${JSON.stringify({ module: state.renderer.module })})`;
	if (shape.wrapper) {
		const remaining = shape.wrapper.arguments.map((argument) => rewriteSourceNode(argument, state));
		wrapped = `${printExpression(shape.wrapper.callee)}(${wrapped}${
			remaining.length === 0 ? '' : `, ${remaining.join(', ')}`
		})`;
	}
	if (state.hmr && exportKind !== null) {
		wrapped = `${state.helpers.hmr}(${JSON.stringify(state.renderer.id)}, ${wrapped})`;
		state.hmrComponents.push({ name, exportKind });
	}
	if (state.profile) {
		const metadata = {
			id: `${state.profileFilename || state.filename || '<anon>'}#${name}@${loc?.line ?? 0}:${loc?.column ?? 0}`,
			name,
			file: state.profileFilename || state.filename || '<anon>',
			line: loc?.line ?? 0,
			column: loc?.column ?? 0,
			kind: 'component',
		};
		wrapped = `${state.helpers.profile}(${wrapped}, ${JSON.stringify(metadata)})`;
	}
	const declaration = state.hmrDialect === 'webpack' && exportKind !== null ? 'let' : 'const';
	if (exportKind === 'named') return `export ${declaration} ${name} = ${wrapped};`;
	if (exportKind === 'default') {
		return `${declaration} ${name} = ${wrapped};\nexport default ${name};`;
	}
	return `const ${name} = ${wrapped};`;
}

const BASE64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function encodeVlqValue(value) {
	let encoded = '';
	let integer = value < 0 ? (-value << 1) | 1 : value << 1;
	do {
		let digit = integer & 31;
		integer >>>= 5;
		if (integer !== 0) digit |= 32;
		encoded += BASE64[digit];
	} while (integer !== 0);
	return encoded;
}

export function encodeMappings(lines) {
	let previousSource = 0;
	let previousOriginalLine = 0;
	let previousOriginalColumn = 0;
	return lines
		.map((segments) => {
			let previousGeneratedColumn = 0;
			return segments
				.map((segment) => {
					const fields = [segment[0] - previousGeneratedColumn];
					previousGeneratedColumn = segment[0];
					if (segment.length > 1) {
						fields.push(
							segment[1] - previousSource,
							segment[2] - previousOriginalLine,
							segment[3] - previousOriginalColumn,
						);
						previousSource = segment[1];
						previousOriginalLine = segment[2];
						previousOriginalColumn = segment[3];
					}
					return fields.map(encodeVlqValue).join('');
				})
				.join(',');
		})
		.join(';');
}

function decodeVlqValue(value, cursor) {
	let integer = 0;
	let shift = 0;
	while (cursor.index < value.length) {
		const digit = BASE64.indexOf(value[cursor.index++]);
		if (digit < 0) break;
		integer |= (digit & 31) << shift;
		if ((digit & 32) === 0) break;
		shift += 5;
	}
	const negative = (integer & 1) === 1;
	integer >>>= 1;
	return negative ? -integer : integer;
}

export function decodeMappings(mappings) {
	let previousSource = 0;
	let previousOriginalLine = 0;
	let previousOriginalColumn = 0;
	return String(mappings ?? '')
		.split(';')
		.map((line) => {
			let previousGeneratedColumn = 0;
			const output = [];
			for (const encoded of line === '' ? [] : line.split(',')) {
				const cursor = { index: 0 };
				const generatedColumn = previousGeneratedColumn + decodeVlqValue(encoded, cursor);
				previousGeneratedColumn = generatedColumn;
				if (cursor.index >= encoded.length) {
					output.push([generatedColumn]);
					continue;
				}
				previousSource += decodeVlqValue(encoded, cursor);
				previousOriginalLine += decodeVlqValue(encoded, cursor);
				previousOriginalColumn += decodeVlqValue(encoded, cursor);
				output.push([
					generatedColumn,
					previousSource,
					previousOriginalLine,
					previousOriginalColumn,
				]);
			}
			return output;
		});
}

function generatedPosition(source, offset) {
	let line = 0;
	let column = 0;
	for (let index = 0; index < offset; index++) {
		if (source.charCodeAt(index) === 10) {
			line++;
			column = 0;
		} else column++;
	}
	return { line, column };
}

function buildIntermediateMap(lowered, source, filename, needles) {
	const lines = [];
	const used = new Set();
	for (const needle of needles) {
		let offset = lowered.indexOf(needle.code);
		while (offset !== -1 && used.has(offset)) offset = lowered.indexOf(needle.code, offset + 1);
		if (offset === -1) continue;
		used.add(offset);
		const generated = generatedPosition(lowered, offset);
		(lines[generated.line] ??= []).push([generated.column, 0, needle.line, needle.column]);
	}
	for (const line of lines) {
		line?.sort((left, right) => left[0] - right[0]);
	}
	return {
		version: 3,
		sources: [(filename || 'module.tsrx').split(/[\\/]/).pop()],
		sourcesContent: [source],
		names: [],
		mappings: encodeMappings(
			Array.from({ length: lines.length }, (_, index) => lines[index] ?? []),
		),
	};
}

export function composeSourceMaps(output, input) {
	if (!output || !input) return output ?? input;
	const outer = decodeMappings(output.mappings);
	const inner = decodeMappings(input.mappings);
	const composed = outer.map((segments) => {
		const line = [];
		for (const segment of segments) {
			if (segment.length === 1) {
				line.push([segment[0]]);
				continue;
			}
			const candidates = inner[segment[2]] ?? [];
			let traced = null;
			for (const candidate of candidates) {
				if (candidate[0] > segment[3]) break;
				traced = candidate;
			}
			if (traced !== null && traced.length > 1) {
				line.push([segment[0], 0, traced[2], traced[3]]);
			} else {
				line.push([segment[0]]);
			}
		}
		return line;
	});
	return {
		...output,
		sources: input.sources,
		sourcesContent: input.sourcesContent,
		names: [],
		mappings: encodeMappings(composed),
	};
}

function lineStarts(source) {
	const starts = [0];
	for (let index = 0; index < source.length; index++) {
		if (source.charCodeAt(index) === 10) starts.push(index + 1);
	}
	return starts;
}

/** Build a high-resolution, temporary map from generated characters to authored offsets. */
export function sourceMapFromOrigins(code, origins, source, filename) {
	const originalLines = lineStarts(source);
	const lines = [[]];
	let generatedLine = 0;
	let generatedColumn = 0;
	let wasMapped = false;
	for (let index = 0; index < code.length; index++) {
		const origin = origins[index] ?? -1;
		if (origin >= 0) {
			let originalLine = 0;
			let low = 0;
			let high = originalLines.length;
			while (low < high) {
				const middle = (low + high) >>> 1;
				if (originalLines[middle] <= origin) low = middle + 1;
				else high = middle;
			}
			originalLine = Math.max(0, low - 1);
			lines[generatedLine].push([
				generatedColumn,
				0,
				originalLine,
				origin - originalLines[originalLine],
			]);
			wasMapped = true;
		} else if (wasMapped) {
			lines[generatedLine].push([generatedColumn]);
			wasMapped = false;
		}
		if (code.charCodeAt(index) === 10) {
			generatedLine++;
			generatedColumn = 0;
			wasMapped = false;
			lines[generatedLine] ??= [];
		} else {
			generatedColumn++;
		}
	}
	return {
		version: 3,
		sources: [(filename || 'module.tsrx').split(/[\\/]/).pop()],
		sourcesContent: [source],
		names: [],
		mappings: encodeMappings(lines),
	};
}

/** Recover exact mapped segment positions as offsets for a subsequent textual rewrite. */
export function originsFromSourceMap(code, map, source) {
	const generatedLines = lineStarts(code);
	const originalLines = lineStarts(source);
	const origins = new Int32Array(code.length);
	origins.fill(-1);
	for (const [line, segments] of decodeMappings(map?.mappings).entries()) {
		const generatedStart = generatedLines[line];
		if (generatedStart === undefined) continue;
		for (const segment of segments) {
			if (segment.length === 1) continue;
			const originalStart = originalLines[segment[2]];
			if (originalStart === undefined) continue;
			const generatedOffset = generatedStart + segment[0];
			if (generatedOffset < code.length) {
				origins[generatedOffset] = originalStart + segment[3];
			}
		}
	}
	return origins;
}

/** Add exact authored anchors for generated constructs that a downstream printer leaves unmapped. */
export function addSourceMapNeedles(map, code, source, needles) {
	if (!map || !needles || needles.length === 0) return map;
	const lines = decodeMappings(map.mappings);
	const originalLines = lineStarts(source);
	for (const needle of needles) {
		if (!needle?.code || needle.offset < 0 || needle.offset >= source.length) continue;
		let originalLine = 0;
		while (
			originalLine + 1 < originalLines.length &&
			originalLines[originalLine + 1] <= needle.offset
		) {
			originalLine++;
		}
		let offset = code.indexOf(needle.code);
		while (offset !== -1) {
			const generated = generatedPosition(code, offset);
			const segments = (lines[generated.line] ??= []);
			const existing = segments.findIndex((segment) => segment[0] === generated.column);
			const mapped = [
				generated.column,
				0,
				originalLine,
				needle.offset - originalLines[originalLine],
			];
			if (existing === -1) segments.push(mapped);
			else segments[existing] = mapped;
			offset = code.indexOf(needle.code, offset + needle.code.length);
		}
	}
	for (const segments of lines) segments?.sort((left, right) => left[0] - right[0]);
	return {
		...map,
		sourcesContent: [source],
		mappings: encodeMappings(lines),
	};
}

const UNIVERSAL_COMPILER_RUNTIME_IMPORTS = new Set([
	...UNIVERSAL_RUNTIME_IMPORTS,
	'__useReducerWithGetter',
	'__useStateWithGetter',
	'hookSlots',
	'useBatch',
	'warmChild',
	'warmMemo',
	'withSlot',
]);

function retargetRuntimeImport(code, moduleId) {
	if (moduleId === 'octane') return code;
	return code.replace(/import\s*\{([\s\S]*?)\}\s*from\s*(['"])octane\2;/g, (_match, body) => {
		const universal = [];
		const dom = [];
		for (const raw of body.split(',')) {
			const specifier = raw.trim();
			if (specifier === '') continue;
			const imported = specifier.split(/\s+as\s+/, 1)[0];
			(UNIVERSAL_COMPILER_RUNTIME_IMPORTS.has(imported) ? universal : dom).push(specifier);
		}
		const imports = [];
		if (dom.length > 0) imports.push(`import { ${dom.join(', ')} } from 'octane';`);
		if (universal.length > 0) {
			imports.push(`import { ${universal.join(', ')} } from ${JSON.stringify(moduleId)};`);
		}
		return imports.join('\n');
	});
}

export function retargetRuntimeImportAliases(code, moduleId, aliases) {
	if (!aliases || aliases.length === 0 || moduleId === 'octane') return code;
	const selected = new Set(aliases);
	return code.replace(
		/import\s*\{([\s\S]*?)\}\s*from\s*(['"])octane\2;/g,
		(_match, body, quote) => {
			const owner = [];
			const child = [];
			for (const raw of body.split(',')) {
				const specifier = raw.trim();
				if (specifier === '') continue;
				const parts = specifier.split(/\s+as\s+/);
				const local = parts[1] ?? parts[0];
				(selected.has(local) ? child : owner).push(specifier);
			}
			if (child.length === 0) return _match;
			const imports = [];
			if (owner.length > 0)
				imports.push(`import { ${owner.join(', ')} } from ${quote}octane${quote};`);
			imports.push(`import { ${child.join(', ')} } from ${JSON.stringify(moduleId)};`);
			return imports.join(' ');
		},
	);
}

function buildUniversalHmrBlock(state) {
	if (state.hmrComponents.length === 0) return '';
	if (state.hmrDialect === 'webpack') {
		const handoffs = state.hmrComponents
			.map(
				(component) =>
					`  if (import.meta.webpackHot.data?.__octaneUniversalComponents?.${component.name}) {\n` +
					`    import.meta.webpackHot.data.__octaneUniversalComponents.${component.name}[${state.helpers.hmrSymbol}].update(${component.name});\n` +
					`    ${component.name} = import.meta.webpackHot.data.__octaneUniversalComponents.${component.name};\n` +
					'  }',
			)
			.join('\n');
		const bindings = state.hmrComponents.map((component) => component.name).join(', ');
		return (
			'if (import.meta.webpackHot) {\n' +
			handoffs +
			'\n  import.meta.webpackHot.dispose((data) => {\n' +
			`    data.__octaneUniversalComponents = { ...data.__octaneUniversalComponents, ${bindings} };\n` +
			'  });\n  import.meta.webpackHot.accept();\n}\n'
		);
	}
	const updates = state.hmrComponents
		.map((component) => {
			const incoming =
				component.exportKind === 'default' ? 'module.default' : `module.${component.name}`;
			return `    ${component.name}[${state.helpers.hmrSymbol}].update(${incoming});`;
		})
		.join('\n');
	return (
		'if (import.meta.hot) {\n  import.meta.hot.accept((module) => {\n' + updates + '\n  });\n}\n'
	);
}

function authoredPosition(source, offset) {
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
	return { line, column };
}

function remapAuthoredLocations(root, origins, source) {
	if (!source) return;
	const seen = new WeakSet();
	const visit = (node) => {
		if (!node || typeof node !== 'object') return;
		if (Array.isArray(node)) {
			for (const child of node) visit(child);
			return;
		}
		if (seen.has(node)) return;
		seen.add(node);
		if (typeof node.start === 'number' && typeof node.end === 'number') {
			let start = -1;
			for (let offset = node.start; offset < node.end; offset++) {
				if ((origins[offset] ?? -1) >= 0) {
					start = origins[offset];
					break;
				}
			}
			let end = -1;
			for (let offset = node.end - 1; offset >= node.start; offset--) {
				if ((origins[offset] ?? -1) >= 0) {
					end = origins[offset] + 1;
					break;
				}
			}
			if (start >= 0) {
				node.loc = {
					start: authoredPosition(source, start),
					end: authoredPosition(source, end >= 0 ? end : start),
				};
			}
		}
		for (const [key, child] of Object.entries(node)) {
			if (key === 'loc' || key === 'start' || key === 'end' || key === 'metadata') continue;
			visit(child);
		}
	};
	visit(root);
}

/**
 * Lower one statically selected child-prop region without closing over its
 * render-time values at module scope. The returned component is stable; its
 * `render` prop is the per-owner-render closure containing those values.
 */
export function lowerUniversalRendererRegion(
	regionSource,
	filename,
	ownerRenderer,
	renderer,
	index,
	kind = 'children',
	options = {},
) {
	if (
		!renderer ||
		typeof renderer.id !== 'string' ||
		typeof renderer.module !== 'string' ||
		renderer.target !== 'universal'
	) {
		throw new TypeError('A renderer-owned universal region requires a universal renderer.');
	}
	const prefix = `__octaneRendererRegion${index}`;
	const expressionPrefix = kind === 'children' ? `(<>` : `(`;
	const expressionSuffix = kind === 'children' ? `</>)` : `)`;
	const effectiveRegionSource = regionSource || 'null';
	const runtimeImport =
		options.runtimeImports?.length > 0
			? `import { ${options.runtimeImports
					.map(({ imported, local }) => `${imported} as ${local}`)
					.join(', ')} } from 'octane';`
			: '';
	const wrapperPrefix = `const ${prefix}Source = ${expressionPrefix}`;
	const generated = (code) => {
		const origins = new Int32Array(code.length);
		origins.fill(-1);
		return { code, origins };
	};
	const concat = (...parts) => {
		const values = parts.flat().filter((part) => part && part.code !== '');
		const code = values.map((part) => part.code).join('');
		const origins = new Int32Array(code.length);
		let offset = 0;
		for (const part of values) {
			origins.set(part.origins, offset);
			offset += part.code.length;
		}
		return { code, origins };
	};
	const regionOrigins =
		options.regionOrigins ??
		(() => {
			const origins = new Int32Array(effectiveRegionSource.length);
			for (let offset = 0; offset < origins.length; offset++) origins[offset] = offset;
			return origins;
		})();
	const synthetic = concat(
		runtimeImport === '' ? null : generated(`${runtimeImport}\n`),
		(options.components ?? []).flatMap((component, componentIndex) =>
			componentIndex === 0 ? [component] : [generated('\n'), component],
		),
		(options.components?.length ?? 0) > 0 ? generated('\n') : null,
		generated(wrapperPrefix),
		{ code: effectiveRegionSource, origins: regionOrigins },
		generated(`${expressionSuffix};`),
	);
	const wrapper = synthetic.code;
	const ast = parseModule(wrapper, filename);
	remapAuthoredLocations(ast, synthetic.origins, options.authoredSource);
	const expressionStatement = ast.body.at(-1);
	const expression = expressionStatement?.declarations?.[0]?.init;
	if (!expression) throw new Error('Octane renderer boundary could not parse its child region.');
	const hmrDialect = options.hmr === true ? 'vite' : options.hmr || false;
	const state = {
		source: wrapper,
		filename,
		renderer,
		names: new Set(),
		plans: [],
		components: [],
		hmr: hmrDialect !== false,
		hmrDialect,
		hmrComponents: [],
		profile: options.profile === true,
		profileFilename: options.profileFilename,
		helpers: {},
		componentNames: collectComponentNames(ast),
		mappingNeedles: [],
		runtimeImports: new Map(),
		planPrefix: prefix,
	};
	state.helpers.component = allocName(state, `${prefix}Define`);
	state.helpers.plan = allocName(state, `${prefix}Plan`);
	state.helpers.value = allocName(state, `${prefix}Value`);
	state.helpers.nestedComponent = allocName(state, `${prefix}Component`);
	state.helpers.props = allocName(state, `${prefix}Props`);
	state.helpers.if = allocName(state, `${prefix}If`);
	state.helpers.switch = allocName(state, `${prefix}Switch`);
	state.helpers.for = allocName(state, `${prefix}For`);
	state.helpers.try = allocName(state, `${prefix}Try`);
	state.helpers.children = allocName(state, `${prefix}Children`);
	state.helpers.context = allocName(state, `${prefix}Context`);
	state.helpers.activity = allocName(state, `${prefix}Activity`);
	const generatedRuntimeAliases = Object.freeze(
		Object.fromEntries(
			[
				'__useStateWithGetter',
				'__useReducerWithGetter',
				'useMemo',
				'useBatch',
				'warmMemo',
				'warmChild',
				'withSlot',
				'hookSlots',
			].map((imported) => [
				imported,
				allocName(
					state,
					`${prefix}${imported
						.replace(/^__/, '')
						.replace(/(^|_)([a-z])/g, (_match, _separator, letter) => letter.toUpperCase())}`,
				),
			]),
		),
	);
	if (state.hmr) {
		state.helpers.hmr = allocName(state, `${prefix}Hmr`);
		state.helpers.hmrSymbol = allocName(state, `${prefix}HmrSymbol`);
	}
	if (state.profile) state.helpers.profile = allocName(state, `${prefix}Profile`);
	validateRuntimeImports(ast, state);
	const regionHelper = allocName(state, `${prefix}Descriptor`);
	const componentName = allocName(state, `${prefix}Body`);
	const emittedComponents = [];
	const specializationBindings = new Set();
	const entryExcluded = new Set((options.runtimeImports ?? []).map(({ local }) => local));
	for (const region of options.deferredRendererRegions ?? []) entryExcluded.add(region.token);
	for (const node of ast.body.slice(0, -1)) {
		if (node.type === 'ImportDeclaration') continue;
		const declaration =
			node.type === 'ExportNamedDeclaration' || node.type === 'ExportDefaultDeclaration'
				? node.declaration
				: node;
		if (declaration?.id?.name) entryExcluded.add(declaration.id.name);
		if (declaration?.id?.name) specializationBindings.add(declaration.id.name);
		if (declaration?.type === 'VariableDeclaration') {
			for (const item of declaration.declarations ?? []) {
				addPatternNames(item.id, entryExcluded);
				addPatternNames(item.id, specializationBindings);
			}
		}
		const shape = componentShape(node, state);
		const component = shape === null ? null : emitComponent(shape, wrapper, state);
		if (component === null) {
			assertNoResidualTemplate(node, state, 'a renderer specialization helper');
			const helper = wrapper.slice(node.start, node.end);
			recordMapping(state, helper, node);
			if (declaration?.id?.name) recordMapping(state, declaration.id.name, declaration.id);
			emittedComponents.push(helper);
			continue;
		}
		emittedComponents.push(component);
	}
	const entryCaptures = collectEntryCaptures(expression, entryExcluded).map((capture) => ({
		...capture,
		local: capture.source,
	}));
	state.sourceNodeReplacements ??= new WeakMap();
	for (const capture of entryCaptures) {
		for (const node of capture.nodes) state.sourceNodeReplacements.set(node, capture.local);
	}
	const deferredRendererNodes = collectIdentifierNodes(
		expression,
		new Set((options.deferredRendererRegions ?? []).map((region) => region.token)),
	);
	for (const [regionIndex, region] of (options.deferredRendererRegions ?? []).entries()) {
		const local = allocName(state, `${prefix}RendererRegionRender${regionIndex}`);
		const descriptor =
			`${region.helper}(${JSON.stringify(region.ownerRenderer.id)}, ` +
			`${JSON.stringify(region.childRenderer.id)}, ${region.body}, { render: ${local} })`;
		for (const node of deferredRendererNodes.get(region.token) ?? []) {
			state.sourceNodeReplacements.set(node, descriptor);
		}
		entryCaptures.push({ local, nodes: [], source: region.renderToken });
	}
	const entryUseSetup = extractEntryParallelUses(expression, state);
	const loweredExpression = isTemplateNode(expression)
		? compileRenderableExpression(expression, state)
		: rewriteSourceNode(expression, state);
	const helperImport =
		`import { defineUniversalComponent as ${state.helpers.component}, ` +
		`universalPlan as ${state.helpers.plan}, universalValue as ${state.helpers.value}, ` +
		`universalComponent as ${state.helpers.nestedComponent}, ` +
		`universalProps as ${state.helpers.props}, universalIf as ${state.helpers.if}, ` +
		`universalSwitch as ${state.helpers.switch}, universalFor as ${state.helpers.for}, ` +
		`universalTry as ${state.helpers.try}, universalChildren as ${state.helpers.children}, ` +
		`universalContext as ${state.helpers.context}, universalActivity as ${state.helpers.activity}, ` +
		`rendererRegion as ${regionHelper}` +
		(state.hmr
			? `, hmrUniversalComponent as ${state.helpers.hmr}, UNIVERSAL_HMR as ${state.helpers.hmrSymbol}`
			: '') +
		Object.entries(generatedRuntimeAliases)
			.map(([imported, local]) => `, ${imported} as ${local}`)
			.join('') +
		` } from ${JSON.stringify(renderer.module)};`;
	const profileImport = state.profile
		? `import { __profileComponent as ${state.helpers.profile} } from 'octane/profiling';`
		: '';
	const plans = state.plans
		.map(
			({ name, root }) =>
				`const ${name} = ${state.helpers.plan}(${JSON.stringify(renderer.id)}, ${JSON.stringify(root)});`,
		)
		.join('\n');
	const entryProps = allocName(state, `${prefix}EntryProps`);
	const captureSetup =
		entryCaptures.length === 0
			? ''
			: `const [${entryCaptures.map((capture) => capture.local).join(', ')}] = ${
					entryProps
				}.captures; `;
	let componentValue =
		`${state.helpers.component}(${JSON.stringify(renderer.id)}, ` +
		`function ${componentName}(${entryProps}) { ${captureSetup}${entryUseSetup.join(' ')}${
			entryUseSetup.length === 0 ? '' : ' '
		}return ${loweredExpression}; }, ` +
		`${JSON.stringify({ module: renderer.module })})`;
	state.components.push({
		name: componentName,
		exportKind: 'named',
		line: expression.loc?.start?.line ?? 0,
		column: expression.loc?.start?.column ?? 0,
		hooks: collectAuthoredHookSites({ body: expression }, state),
	});
	if (state.hmr) {
		componentValue = `${state.helpers.hmr}(${JSON.stringify(renderer.id)}, ${componentValue})`;
		state.hmrComponents.push({ name: componentName, exportKind: 'named' });
	}
	if (state.profile) {
		const loc = expression.loc?.start;
		componentValue = `${state.helpers.profile}(${componentValue}, ${JSON.stringify({
			id: `${state.profileFilename || filename || '<anon>'}#${componentName}@${loc?.line ?? 0}:${loc?.column ?? 0}`,
			name: componentName,
			file: state.profileFilename || filename || '<anon>',
			line: loc?.line ?? 0,
			column: loc?.column ?? 0,
			kind: 'component',
		})})`;
	}
	const declaration = state.hmrDialect === 'webpack' ? 'let' : 'const';
	const component = `export ${declaration} ${componentName} = ${componentValue};`;
	specializationBindings.add(componentName);
	const hmrBlock = buildUniversalHmrBlock(state);
	const prelude = [
		helperImport,
		profileImport,
		runtimeImport,
		plans,
		emittedComponents.join('\n'),
		component,
		hmrBlock,
	]
		.filter(Boolean)
		.join('\n');
	const loweredRegionExpression =
		`${regionHelper}(${JSON.stringify(ownerRenderer)}, ${JSON.stringify(renderer.id)}, ` +
		`${componentName}, { captures: [${entryCaptures
			.map((capture) => capture.source)
			.join(', ')}] })`;
	const mappings = state.mappingNeedles
		.filter((needle) => typeof needle.offset === 'number' && synthetic.origins[needle.offset] >= 0)
		.map((needle) => ({ code: needle.code, offset: synthetic.origins[needle.offset] }));
	const mapOrigins = (code) => {
		const origins = new Int32Array(code.length);
		origins.fill(-1);
		const used = new Set();
		for (const needle of mappings) {
			let offset = code.indexOf(needle.code);
			while (offset !== -1 && used.has(offset)) offset = code.indexOf(needle.code, offset + 1);
			if (offset === -1) continue;
			used.add(offset);
			origins[offset] = needle.offset;
		}
		return origins;
	};
	return Object.freeze({
		mappings: Object.freeze(mappings),
		metadata: Object.freeze({
			componentHelper: state.helpers.component,
			componentValueHelper: state.helpers.nestedComponent,
			propsHelper: state.helpers.props,
			regionHelpers: Object.freeze({
				children: state.helpers.children,
				if: state.helpers.if,
				switch: state.helpers.switch,
				for: state.helpers.for,
				try: state.helpers.try,
				context: state.helpers.context,
				activity: state.helpers.activity,
			}),
			components: Object.freeze(state.components),
			bindings: Object.freeze([...specializationBindings]),
			generatedRuntimeAliases,
			renderer,
			runtimeAliases: Object.freeze((options.runtimeImports ?? []).map(({ local }) => local)),
			runtimeImports: Object.freeze(options.runtimeImports ?? []),
		}),
		prelude,
		preludeOrigins: mapOrigins(prelude),
		expression: loweredRegionExpression,
		expressionOrigins: mapOrigins(loweredRegionExpression),
	});
}

/**
 * @param {string} source
 * @param {string} filename
 * @param {{ id: string, module: string, target: 'universal', text?: 'host'|'ignore'|'reject', capabilities?: readonly string[] }} renderer
 * @param {(source: string, metadata: any) => { code: string, map: any }} compileClient
 * @param {Record<string, any>} [options]
 */
export function compileUniversal(source, filename, renderer, compileClient, options = {}) {
	if (
		!renderer ||
		typeof renderer.id !== 'string' ||
		typeof renderer.module !== 'string' ||
		renderer.target !== 'universal'
	) {
		throw new TypeError('Octane universal compiler requires a resolved universal renderer.');
	}
	const ast = parseModule(source, filename);
	const hmrDialect = options.hmr === true ? 'vite' : options.hmr || false;
	const state = {
		source,
		filename,
		renderer,
		names: new Set(),
		plans: [],
		components: [],
		hmr: hmrDialect !== false,
		hmrDialect,
		hmrComponents: [],
		profile: options.profile === true,
		profileFilename: options.profileFilename,
		helpers: {},
		componentNames: collectComponentNames(ast),
		mappingNeedles: [],
		runtimeImports: new Map(),
	};
	state.helpers.component = allocName(state, '__octaneDefineUniversalComponent');
	state.helpers.plan = allocName(state, '__octaneUniversalPlan');
	state.helpers.value = allocName(state, '__octaneUniversalValue');
	state.helpers.nestedComponent = allocName(state, '__octaneUniversalComponent');
	state.helpers.props = allocName(state, '__octaneUniversalProps');
	state.helpers.if = allocName(state, '__octaneUniversalIf');
	state.helpers.switch = allocName(state, '__octaneUniversalSwitch');
	state.helpers.for = allocName(state, '__octaneUniversalFor');
	state.helpers.try = allocName(state, '__octaneUniversalTry');
	state.helpers.children = allocName(state, '__octaneUniversalChildren');
	state.helpers.context = allocName(state, '__octaneUniversalContext');
	state.helpers.activity = allocName(state, '__octaneUniversalActivity');
	if (state.hmr) {
		state.helpers.hmr = allocName(state, '__octaneUniversalHmr');
		state.helpers.hmrSymbol = allocName(state, '__octaneUniversalHmrSymbol');
	}
	if (state.profile) state.helpers.profile = allocName(state, '__octaneProfileComponent');
	validateRuntimeImports(ast, state);

	const emitted = [];
	for (const node of ast.body ?? []) {
		const shape = componentShape(node, state);
		if (shape !== null) {
			const component = emitComponent(shape, source, state);
			if (component !== null) {
				emitted.push(component);
				continue;
			}
		}
		assertNoResidualTemplate(node, state, 'an unsupported module declaration');
		emitted.push(source.slice(node.start, node.end));
	}

	const helperImport =
		`import { defineUniversalComponent as ${state.helpers.component}, ` +
		`universalPlan as ${state.helpers.plan}, universalValue as ${state.helpers.value}, ` +
		`universalComponent as ${state.helpers.nestedComponent}, ` +
		`universalProps as ${state.helpers.props}, universalIf as ${state.helpers.if}, ` +
		`universalSwitch as ${state.helpers.switch}, universalFor as ${state.helpers.for}, ` +
		`universalTry as ${state.helpers.try}, universalChildren as ${state.helpers.children}, ` +
		`universalContext as ${state.helpers.context}, universalActivity as ${state.helpers.activity}` +
		(state.hmr
			? `, hmrUniversalComponent as ${state.helpers.hmr}, UNIVERSAL_HMR as ${state.helpers.hmrSymbol}`
			: '') +
		` } from ${JSON.stringify(renderer.module)};`;
	const profileImport = state.profile
		? `import { __profileComponent as ${state.helpers.profile} } from 'octane/profiling';`
		: '';
	const plans = state.plans
		.map(
			({ name, root }) =>
				`const ${name} = ${state.helpers.plan}(${JSON.stringify(renderer.id)}, ${JSON.stringify(root)});`,
		)
		.join('\n');
	let hmrBlock = '';
	if (state.hmrComponents.length > 0) {
		if (state.hmrDialect === 'webpack') {
			const handoffs = state.hmrComponents
				.map(
					(component) =>
						`  if (import.meta.webpackHot.data?.__octaneUniversalComponents?.${component.name}) {\n` +
						`    import.meta.webpackHot.data.__octaneUniversalComponents.${component.name}[${state.helpers.hmrSymbol}].update(${component.name});\n` +
						`    ${component.name} = import.meta.webpackHot.data.__octaneUniversalComponents.${component.name};\n` +
						'  }',
				)
				.join('\n');
			const bindings = state.hmrComponents.map((component) => component.name).join(', ');
			hmrBlock =
				'if (import.meta.webpackHot) {\n' +
				handoffs +
				'\n  import.meta.webpackHot.dispose((data) => {\n' +
				`    data.__octaneUniversalComponents = { ...data.__octaneUniversalComponents, ${bindings} };\n` +
				'  });\n  import.meta.webpackHot.accept();\n}\n';
		} else {
			const updates = state.hmrComponents
				.map((component) => {
					const incoming =
						component.exportKind === 'default' ? 'module.default' : `module.${component.name}`;
					return `    ${component.name}[${state.helpers.hmrSymbol}].update(${incoming});`;
				})
				.join('\n');
			hmrBlock =
				'if (import.meta.hot) {\n  import.meta.hot.accept((module) => {\n' +
				updates +
				'\n  });\n}\n';
		}
	}
	const lowered = `${helperImport}\n${profileImport}\n${plans}\n${emitted.join('\n')}\n${hmrBlock}`;
	const intermediateMap = buildIntermediateMap(lowered, source, filename, state.mappingNeedles);
	const result = compileClient(lowered, {
		componentHelper: state.helpers.component,
		componentValueHelper: state.helpers.nestedComponent,
		propsHelper: state.helpers.props,
		regionHelpers: {
			children: state.helpers.children,
			if: state.helpers.if,
			switch: state.helpers.switch,
			for: state.helpers.for,
			try: state.helpers.try,
			context: state.helpers.context,
			activity: state.helpers.activity,
		},
		components: state.components,
		sourceMap: intermediateMap,
	});
	return {
		code: retargetRuntimeImport(result.code, renderer.module),
		map: result.__universalSourceMapComposed
			? result.map
			: composeSourceMaps(result.map, intermediateMap),
	};
}
