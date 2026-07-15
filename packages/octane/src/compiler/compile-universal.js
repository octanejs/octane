/**
 * Experimental universal-target lowering.
 *
 * This is intentionally separate from the mature DOM planner. It lowers host
 * JSX to immutable host/range/text/slot plans and leaves dynamic expressions
 * in dense value arrays. The resulting JSX-free module is handed back through
 * the existing client hook/dependency pass, then its Octane runtime import is
 * retargeted to the selected renderer module.
 */
import { parseModule } from '@tsrx/core';
import { print as esrapPrint } from 'esrap';
import esrapTsx from 'esrap/languages/tsx';

const UNIVERSAL_RUNTIME_IMPORTS = new Set([
	'Activity',
	'createContext',
	'createPortal',
	'startTransition',
	'use',
	'useCallback',
	'useContext',
	'useDebugValue',
	'useEffect',
	'useEffectEvent',
	'useImperativeHandle',
	'useInsertionEffect',
	'useLayoutEffect',
	'useMemo',
	'useReducer',
	'useRef',
	'useState',
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

function assertNoEarlyComponentReturn(node, state) {
	if (node == null || typeof node !== 'object') return;
	if (Array.isArray(node)) {
		for (const child of node) assertNoEarlyComponentReturn(child, state);
		return;
	}
	if (
		node.type === 'FunctionDeclaration' ||
		node.type === 'FunctionExpression' ||
		node.type === 'ArrowFunctionExpression'
	) {
		return;
	}
	if (node.type === 'ReturnStatement') {
		throw universalError(
			state.filename,
			node,
			'early component returns are deferred until universal branch plans are transactional.',
		);
	}
	for (const [key, value] of Object.entries(node)) {
		if (key === 'loc' || key === 'start' || key === 'end') continue;
		assertNoEarlyComponentReturn(value, state);
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
					'phase-1 universal modules require named imports from octane.',
				);
			}
			const imported = specifier.imported?.name ?? specifier.imported?.value;
			if (!UNIVERSAL_RUNTIME_IMPORTS.has(imported)) {
				throw universalError(
					state.filename,
					specifier,
					`runtime import ${JSON.stringify(imported)} is not supported by the phase-1 universal target.`,
				);
			}
		}
	}
}

function jsxName(node) {
	const name = node?.openingElement?.name ?? node?.name;
	return name?.type === 'JSXIdentifier' ? name.name : null;
}

function attributeName(attribute) {
	return attribute?.name?.type === 'JSXIdentifier' ? attribute.name.name : null;
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

function compileAttribute(attribute, context, state) {
	if (attribute.type === 'JSXSpreadAttribute' || attribute.type === 'SpreadAttribute') {
		throw universalError(
			state.filename,
			attribute,
			'spread attributes are not part of the phase-1 static host-plan ABI.',
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
		assertNoResidualTemplate(value.expression, state, `host attribute ${name}`);
		const slot = context.values.length;
		context.values.push(printExpression(value.expression));
		return { name, slot };
	}
	throw universalError(state.filename, attribute, `unsupported value for host attribute ${name}.`);
}

function compileHostElement(node, context, state) {
	const type = jsxName(node);
	if (type === null) {
		throw universalError(
			state.filename,
			node,
			'member-expression and namespaced host tags are unsupported.',
		);
	}
	if (type === 'Activity') {
		throw universalError(
			state.filename,
			node,
			'Activity requires an explicit renderer visibility capability.',
		);
	}
	if (!/^[a-z]/.test(type)) {
		throw universalError(
			state.filename,
			node,
			`nested component <${type}> needs the universal component-slot phase; use a host tag in this vertical slice.`,
		);
	}
	const props = {};
	const bindings = [];
	for (const attribute of node.openingElement?.attributes ?? node.attributes ?? []) {
		const compiled = compileAttribute(attribute, context, state);
		if (compiled === null) continue;
		if ('slot' in compiled) bindings.push([compiled.name, compiled.slot]);
		else props[compiled.name] = compiled.staticValue;
	}
	const children = compileChildren(node.children ?? [], context, state);
	return {
		kind: 'host',
		type,
		...(Object.keys(props).length === 0 ? null : { props }),
		...(bindings.length === 0 ? null : { bindings }),
		...(children.length === 0 ? null : { children }),
	};
}

function compileFor(node, context, state) {
	if (node.await) {
		throw universalError(
			state.filename,
			node,
			'await @for requires the async-collection capability.',
		);
	}
	if (node.empty) {
		throw universalError(
			state.filename,
			node,
			'@empty lowering is deferred to the universal control-flow phase.',
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
	const indexBinding = allocName(state, '__octaneUniversalIndex');
	const itemContext = { values: [] };
	const bodyChildren = compileChildren(node.body?.body ?? [], itemContext, state);
	const itemRoot =
		bodyChildren.length === 1 ? bodyChildren[0] : { kind: 'range', children: bodyChildren };
	const itemPlan = allocPlan(state, itemRoot);
	assertNoResidualTemplate(node.right, state, '@for source');
	assertNoResidualTemplate(node.key, state, '@for key');
	const source = printExpression(node.right);
	const key = printExpression(node.key);
	const values = `[${itemContext.values.join(', ')}]`;
	const expression =
		`${state.helpers.list}(${source}, (${itemBinding}, ${indexBinding}) => ` +
		`${state.helpers.key}(${key}, ${state.helpers.value}(${itemPlan}, ${values})))`;
	return addDynamic(context, expression);
}

function compileChild(node, context, state) {
	if (node == null) return [];
	if (node.type === 'JSXText') {
		const value = normalizeJsxText(node.value);
		return value === '' ? [] : [{ kind: 'text', value }];
	}
	if (node.type === 'JSXExpressionContainer') {
		if (!node.expression || node.expression.type === 'JSXEmptyExpression') return [];
		assertNoResidualTemplate(node.expression, state, 'a dynamic child expression');
		return [addDynamic(context, printExpression(node.expression))];
	}
	if (node.type === 'JSXElement' || node.type === 'Element') {
		return [compileHostElement(node, context, state)];
	}
	if (node.type === 'JSXFragment' || node.type === 'Fragment') {
		return [{ kind: 'range', children: compileChildren(node.children ?? [], context, state) }];
	}
	if (node.type === 'JSXForExpression') return [compileFor(node, context, state)];
	if (node.type === 'JSXStyleElement') {
		throw universalError(
			state.filename,
			node,
			'scoped <style> requires a renderer style/assets capability.',
		);
	}
	if (
		node.type === 'JSXIfExpression' ||
		node.type === 'JSXSwitchExpression' ||
		node.type === 'JSXTryExpression' ||
		node.type === 'JSXActivityExpression'
	) {
		throw universalError(
			state.filename,
			node,
			`${node.type} is deferred to the universal control-flow/capability phase.`,
		);
	}
	throw universalError(state.filename, node, `unsupported template node ${node.type}.`);
}

function compileChildren(children, context, state) {
	const output = [];
	for (const child of children) output.push(...compileChild(child, context, state));
	return output;
}

function allocPlan(state, root) {
	const name = allocName(state, `__octaneUniversalPlan${state.plans.length}`);
	state.plans.push({ name, root });
	return name;
}

function componentShape(node) {
	if (node.type === 'FunctionDeclaration') return { fn: node, exportKind: null };
	if (node.type === 'ExportNamedDeclaration' && node.declaration?.type === 'FunctionDeclaration') {
		return { fn: node.declaration, exportKind: 'named' };
	}
	if (
		node.type === 'ExportDefaultDeclaration' &&
		node.declaration?.type === 'FunctionDeclaration'
	) {
		return { fn: node.declaration, exportKind: 'default' };
	}
	return null;
}

function componentRender(fn, state) {
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
	if (fn.body?.type !== 'BlockStatement') return null;
	const returns = (fn.body.body ?? []).filter((statement) => statement.type === 'ReturnStatement');
	if (returns.length !== 1) return null;
	const returned = returns[0];
	if (
		returned.argument?.type !== 'JSXElement' &&
		returned.argument?.type !== 'JSXFragment' &&
		returned.argument?.type !== 'Element' &&
		returned.argument?.type !== 'Fragment'
	) {
		return null;
	}
	if (fn.body.body.at(-1) !== returned) {
		throw universalError(
			state.filename,
			returned,
			'phase-1 return-JSX components require one final return statement.',
		);
	}
	return { setup: fn.body.body.slice(0, -1), render: returned.argument };
}

function emitComponent(shape, source, state) {
	const { fn, exportKind } = shape;
	const render = componentRender(fn, state);
	if (render === null) return null;
	let name = fn.id?.name;
	if (!name) name = allocName(state, '__octaneUniversalDefault');
	for (const parameter of fn.params ?? []) {
		assertNoResidualTemplate(parameter, state, 'component parameters');
	}
	const context = { values: [] };
	const nodes = compileChild(render.render, context, state);
	const root = nodes.length === 1 ? nodes[0] : { kind: 'range', children: nodes };
	const plan = allocPlan(state, root);
	const originalHeader = fn.id
		? source.slice(fn.start, fn.body.start)
		: `function ${name}(${(fn.params ?? []).map((param) => printNode(param)).join(', ')}) `;
	for (const statement of render.setup) {
		assertNoEarlyComponentReturn(statement, state);
		assertNoResidualTemplate(statement, state, 'component setup');
	}
	const setup = render.setup
		.map((statement) => source.slice(statement.start, statement.end))
		.join('\n');
	const body =
		`${originalHeader}{\n${setup}${setup === '' ? '' : '\n'}` +
		`return ${state.helpers.value}(${plan}, [${context.values.join(', ')}]);\n}`;
	const wrapped =
		`${state.helpers.component}(${JSON.stringify(state.renderer.id)}, ${body}, ` +
		`${JSON.stringify({ module: state.renderer.module })})`;
	if (exportKind === 'named') return `export const ${name} = ${wrapped};`;
	if (exportKind === 'default') return `const ${name} = ${wrapped};\nexport default ${name};`;
	return `const ${name} = ${wrapped};`;
}

function retargetRuntimeImport(code, moduleId) {
	if (moduleId === 'octane') return code;
	const replacement = `from ${JSON.stringify(moduleId)};`;
	return code.split("from 'octane';").join(replacement);
}

/**
 * @param {string} source
 * @param {string} filename
 * @param {{ id: string, module: string, target: 'universal' }} renderer
 * @param {(source: string) => { code: string, map: any }} compileClient
 */
export function compileUniversal(source, filename, renderer, compileClient) {
	if (
		!renderer ||
		typeof renderer.id !== 'string' ||
		typeof renderer.module !== 'string' ||
		renderer.target !== 'universal'
	) {
		throw new TypeError('Octane universal compiler requires a resolved universal renderer.');
	}
	const ast = parseModule(source, filename);
	const state = {
		source,
		filename,
		renderer,
		names: new Set(),
		plans: [],
		helpers: {},
	};
	state.helpers.component = allocName(state, '__octaneDefineUniversalComponent');
	state.helpers.plan = allocName(state, '__octaneUniversalPlan');
	state.helpers.value = allocName(state, '__octaneUniversalValue');
	state.helpers.list = allocName(state, '__octaneUniversalList');
	state.helpers.key = allocName(state, '__octaneUniversalKey');
	validateRuntimeImports(ast, state);

	const emitted = [];
	let componentCount = 0;
	for (const node of ast.body ?? []) {
		const shape = componentShape(node);
		if (shape !== null) {
			const component = emitComponent(shape, source, state);
			if (component !== null) {
				emitted.push(component);
				componentCount++;
				continue;
			}
		}
		if (
			node.type === 'VariableDeclaration' &&
			(node.declarations ?? []).some(
				(declaration) => declaration.init?.body?.type === 'JSXCodeBlock',
			)
		) {
			throw universalError(
				filename,
				node,
				'arrow-function components are deferred; use a named function declaration for this phase.',
			);
		}
		assertNoResidualTemplate(node, state, 'an unsupported module declaration');
		emitted.push(source.slice(node.start, node.end));
	}
	if (componentCount === 0) {
		throw new Error(`Octane universal compiler: ${filename} contains no universal component.`);
	}

	const helperImport =
		`import { defineUniversalComponent as ${state.helpers.component}, ` +
		`universalPlan as ${state.helpers.plan}, universalValue as ${state.helpers.value}, ` +
		`universalList as ${state.helpers.list}, universalKey as ${state.helpers.key} } from 'octane';`;
	const plans = state.plans
		.map(
			({ name, root }) =>
				`const ${name} = ${state.helpers.plan}(${JSON.stringify(renderer.id)}, ${JSON.stringify(root)});`,
		)
		.join('\n');
	const lowered = `${helperImport}\n${plans}\n${emitted.join('\n')}\n`;
	const result = compileClient(lowered);
	return { code: retargetRuntimeImport(result.code, renderer.module), map: result.map };
}
