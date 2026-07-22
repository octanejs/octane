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
import { normalizeUniversalRuntime } from './universal-runtime.js';

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

// A renderer must opt in explicitly before main-thread metadata changes emitted
// code. This keeps universalRuntime useful as cache/diagnostic identity for
// ordinary renderers while allowing native first-screen programs to erase
// background-owned callbacks from their render-only specialization.
const MAIN_THREAD_RENDER_ONLY_CAPABILITY = 'main-thread-render-only';
const THREAD_FUNCTION_CAPABILITY = 'thread-functions';
const THREAD_DIRECTIVES = new Map([
	['main thread', 'main-thread'],
	['background only', 'background'],
]);
const UNIVERSAL_REALM_GLOBALS = new Set([
	'Array',
	'ArrayBuffer',
	'Atomics',
	'BigInt',
	'BigInt64Array',
	'BigUint64Array',
	'Boolean',
	'DataView',
	'Date',
	'Error',
	'EvalError',
	'FinalizationRegistry',
	'Float32Array',
	'Float64Array',
	'Function',
	'Infinity',
	'Int16Array',
	'Int32Array',
	'Int8Array',
	'Intl',
	'JSON',
	'Map',
	'Math',
	'NaN',
	'Number',
	'Object',
	'Promise',
	'Proxy',
	'RangeError',
	'ReferenceError',
	'Reflect',
	'RegExp',
	'Set',
	'SharedArrayBuffer',
	'String',
	'Symbol',
	'SyntaxError',
	'TypeError',
	'URIError',
	'Uint16Array',
	'Uint32Array',
	'Uint8Array',
	'Uint8ClampedArray',
	'WeakMap',
	'WeakRef',
	'WeakSet',
	'WebAssembly',
	'console',
	'decodeURI',
	'decodeURIComponent',
	'encodeURI',
	'encodeURIComponent',
	'escape',
	'eval',
	'globalThis',
	'isFinite',
	'isNaN',
	'parseFloat',
	'parseInt',
	'undefined',
	'unescape',
]);
const MAIN_THREAD_BACKGROUND_EFFECTS = new Set([
	'useEffect',
	'useEffectEvent',
	'useImperativeHandle',
	'useInsertionEffect',
	'useLayoutEffect',
]);

function isMainThreadRenderOnly(state) {
	return (
		state.universalRuntime?.thread === 'main-thread' &&
		rendererHasCapability(state, MAIN_THREAD_RENDER_ONLY_CAPABILITY)
	);
}

function isFirstScreenEvent(name, state) {
	return (state.renderer.firstScreenEvents ?? []).some((pattern) => hostPropMatches(name, pattern));
}

function unwrapFirstScreenExpression(node) {
	while (
		node &&
		(node.type === 'ParenthesizedExpression' ||
			node.type === 'ChainExpression' ||
			node.type === 'TSAsExpression' ||
			node.type === 'TSNonNullExpression' ||
			node.type === 'TSSatisfiesExpression' ||
			node.type === 'TSTypeAssertion')
	) {
		node = node.expression;
	}
	return node;
}

function firstScreenEventHelper(state) {
	return (state.helpers.firstScreenEvent ??= allocName(state, '__octaneFirstScreenEvent'));
}

function firstScreenEventValue(expression, state) {
	const value = unwrapFirstScreenExpression(expression);
	if (value?.type === 'ArrowFunctionExpression' || value?.type === 'FunctionExpression') {
		return firstScreenEventHelper(state);
	}
	if (value?.type === 'Literal' && value.value === null) {
		return printDynamicExpression(expression, state);
	}
	if (value?.type === 'Identifier' && value.name === 'undefined') {
		return printDynamicExpression(expression, state);
	}
	if (value?.type === 'UnaryExpression' && value.operator === 'void') {
		return printDynamicExpression(expression, state);
	}
	if (value?.type === 'ConditionalExpression') {
		return `(${printDynamicExpression(value.test, state)} ? ${firstScreenEventValue(
			value.consequent,
			state,
		)} : ${firstScreenEventValue(value.alternate, state)})`;
	}
	// A callback read through props or another runtime expression may be
	// optional. Evaluate that read exactly once, preserve its nullish absence,
	// and replace only a present value with the marker. Inline callback bodies
	// take the static branch above and never enter the main-thread graph.
	return `((${printDynamicExpression(expression, state)}) == null ? undefined : ${firstScreenEventHelper(state)})`;
}

function mainThreadHostValue(name, expression, state) {
	if (!isMainThreadRenderOnly(state)) return printDynamicExpression(expression, state);
	if (name === 'ref') return 'undefined';
	return isFirstScreenEvent(name, state)
		? firstScreenEventValue(expression, state)
		: printDynamicExpression(expression, state);
}

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
	const prefix = state.sourceNodePrefixes?.get(node) ?? '';
	const directReplacement = state.sourceNodeReplacements?.get(node);
	if (directReplacement !== undefined) return prefix + directReplacement;
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
		const nestedPrefix = state.sourceNodePrefixes?.get(value) ?? '';
		if (value !== node && replacement !== undefined) {
			replacements.push({ start: value.start, end: value.end, code: nestedPrefix + replacement });
			return;
		}
		if (value !== node && nestedPrefix !== '') {
			replacements.push({ start: value.start, end: value.start, code: nestedPrefix });
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
	return prefix + code;
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

/**
 * Keep effect hook calls (and therefore compiler-assigned call-site slots) in
 * the first-screen program, but erase every authored argument before the
 * shared hook pass sees it. The main renderer supplies inert implementations;
 * preserving the call shape keeps later state/useId slots deterministic while
 * removing callback closures, captured imports, refs, and dependency reads.
 */
function prepareMainThreadRenderOnlyReplacements(ast, state) {
	if (!isMainThreadRenderOnly(state)) return;
	state.sourceNodeReplacements ??= new WeakMap();
	const { nodeScopes, resolveBinding, rootScope } = createLexicalAnalysis(ast);
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
			node.type === 'CallExpression' &&
			node.callee?.type === 'Identifier' &&
			resolveBinding(nodeScopes.get(node.callee) ?? rootScope, node.callee.name)?.importSource
				?.value === 'octane' &&
			MAIN_THREAD_BACKGROUND_EFFECTS.has(state.runtimeImports.get(node.callee.name))
		) {
			for (const argument of node.arguments ?? []) {
				if (argument && typeof argument === 'object') {
					state.sourceNodeReplacements.set(argument, 'undefined');
				}
			}
			return;
		}
		for (const [key, child] of Object.entries(node)) {
			if (key === 'loc' || key === 'start' || key === 'end' || key === 'metadata') continue;
			visit(child);
		}
	};
	visit(ast);
}

const NON_RUNTIME_AST_KEYS = new Set([
	'end',
	'implements',
	'loc',
	'metadata',
	'returnType',
	'start',
	'superTypeArguments',
	'superTypeParameters',
	'typeAnnotation',
	'typeArguments',
	'typeParameters',
]);
const RUNTIME_TYPESCRIPT_NODES = new Set([
	'TSAsExpression',
	'TSEnumDeclaration',
	'TSEnumMember',
	'TSExportAssignment',
	'TSImportEqualsDeclaration',
	'TSInstantiationExpression',
	'TSModuleBlock',
	'TSModuleDeclaration',
	'TSNonNullExpression',
	'TSParameterProperty',
	'TSQualifiedName',
	'TSSatisfiesExpression',
	'TSTypeAssertion',
]);

function forEachRuntimeAstChild(node, visit) {
	if (
		typeof node?.type === 'string' &&
		node.type.startsWith('TS') &&
		!RUNTIME_TYPESCRIPT_NODES.has(node.type)
	) {
		return;
	}
	for (const [key, value] of Object.entries(node)) {
		if (NON_RUNTIME_AST_KEYS.has(key) || value === null || typeof value !== 'object') continue;
		if (Array.isArray(value)) {
			for (const child of value) visit(child, key);
		} else {
			visit(value, key);
		}
	}
}

function authoredNodePredicate(origins) {
	if (!origins) return () => true;
	const authoredOffsets = new Uint32Array(origins.length + 1);
	for (let index = 0; index < origins.length; index++) {
		authoredOffsets[index + 1] = authoredOffsets[index] + (origins[index] >= 0 ? 1 : 0);
	}
	return (node) => {
		if (typeof node?.start !== 'number' || typeof node?.end !== 'number') return false;
		const start = Math.max(0, Math.min(origins.length, node.start));
		const end = Math.max(start, Math.min(origins.length, node.end));
		return authoredOffsets[end] !== authoredOffsets[start];
	};
}

function originalNodePredicate(origins, sourceLength) {
	const includedOffsets = new Uint8Array(sourceLength + 1);
	for (const origin of origins) {
		if (origin >= 0 && origin < sourceLength) includedOffsets[origin] = 1;
	}
	const includedPrefix = new Uint32Array(sourceLength + 1);
	for (let index = 0; index < sourceLength; index++) {
		includedPrefix[index + 1] = includedPrefix[index] + includedOffsets[index];
	}
	return (node) => {
		if (typeof node?.start !== 'number' || typeof node?.end !== 'number') return false;
		const start = Math.max(0, Math.min(sourceLength, node.start));
		const end = Math.max(start, Math.min(sourceLength, node.end));
		return includedPrefix[end] !== includedPrefix[start];
	};
}

function forbiddenImportMatch(source, forbidden) {
	return forbidden.find((packageId) => source === packageId || source.startsWith(`${packageId}/`));
}

function validateForbiddenImports(
	ast,
	state,
	validation,
	isAuthored,
	lexicalAnalysis = null,
	referencedStaticSources = null,
) {
	const forbidden = validation.forbiddenImports;
	if (!forbidden || forbidden.length === 0) return;
	const { nodeScopes, rootScope, isBound } = lexicalAnalysis ?? createLexicalAnalysis(ast);
	const requests = [];
	const collectRequest = (sourceNode, kind = 'import') => {
		const source = sourceNode?.value;
		if (
			typeof source !== 'string' ||
			!isThreadNodeActive(state, sourceNode) ||
			isThreadImportElided(state, sourceNode) ||
			(!isAuthored(sourceNode) && !referencedStaticSources?.has(sourceNode))
		) {
			return;
		}
		const matched = forbiddenImportMatch(source, forbidden);
		if (matched !== undefined) requests.push({ kind, matched, source, sourceNode });
	};
	for (const node of ast.body ?? []) {
		let sourceNode = null;
		if (
			node.type === 'ImportDeclaration' ||
			node.type === 'ExportNamedDeclaration' ||
			node.type === 'ExportAllDeclaration'
		) {
			sourceNode = node.source;
		} else if (node.type === 'TSImportEqualsDeclaration') {
			sourceNode = node.moduleReference?.expression;
		}
		collectRequest(sourceNode);
	}
	const seen = new WeakSet();
	const visit = (node) => {
		if (!node || typeof node !== 'object') return;
		if (Array.isArray(node)) {
			for (const child of node) visit(child);
			return;
		}
		if (seen.has(node)) return;
		seen.add(node);
		if (!isThreadNodeActive(state, node)) return;
		if (node.type === 'ImportExpression') collectRequest(node.source);
		if (node.type === 'CallExpression') {
			let bindingName = null;
			if (node.callee?.type === 'Identifier' && node.callee.name === 'require') {
				bindingName = 'require';
			} else if (
				(node.callee?.type === 'MemberExpression' ||
					node.callee?.type === 'OptionalMemberExpression') &&
				node.callee.object?.type === 'Identifier' &&
				node.callee.object.name === 'module'
			) {
				const propertyName = node.callee.computed
					? node.callee.property?.value
					: node.callee.property?.name;
				if (propertyName === 'require') bindingName = 'module';
			}
			const scope = nodeScopes.get(node) ?? rootScope;
			if (bindingName !== null && !isBound(scope, bindingName)) {
				collectRequest(node.arguments?.[0], 'CommonJS require');
			}
		}
		forEachRuntimeAstChild(node, visit);
	};
	visit(ast);
	if (requests.length > 0) {
		requests.sort((left, right) => (left.sourceNode.start ?? 0) - (right.sourceNode.start ?? 0));
		const { kind, matched, source, sourceNode } = requests[0];
		throw universalError(
			state.filename,
			sourceNode,
			`renderer ${JSON.stringify(state.renderer.id)} forbids static ${kind} ${JSON.stringify(source)} (matched ${JSON.stringify(matched)}).`,
		);
	}
}

function createLexicalScope(parent, isFunction = false) {
	const scope = { bindings: new Set(), functionScope: null, importSources: new Map(), parent };
	scope.functionScope = isFunction ? scope : (parent?.functionScope ?? scope);
	return scope;
}

function createLexicalAnalysis(ast) {
	const bindingNodes = new WeakSet();
	const nonReferenceNodes = new WeakSet();
	const nodeScopes = new WeakMap();
	const rootScope = createLexicalScope(null, true);
	const hasBinding = (scope, name) => {
		for (let current = scope; current; current = current.parent) {
			if (current.bindings.has(name)) return true;
		}
		return false;
	};
	const commonJsSource = (node, scope) => {
		if (node?.type !== 'CallExpression') return null;
		if (
			node.callee?.type === 'Identifier' &&
			node.callee.name === 'require' &&
			!hasBinding(scope, 'require')
		) {
			return node.arguments?.[0] ?? null;
		}
		if (
			(node.callee?.type === 'MemberExpression' ||
				node.callee?.type === 'OptionalMemberExpression') &&
			node.callee.object?.type === 'Identifier' &&
			node.callee.object.name === 'module' &&
			!hasBinding(scope, 'module')
		) {
			const propertyName = node.callee.computed
				? node.callee.property?.value
				: node.callee.property?.name;
			if (propertyName === 'require') return node.arguments?.[0] ?? null;
		}
		return null;
	};
	const declarePattern = (pattern, scope, importSource = null) => {
		if (!pattern) return;
		if (pattern.type === 'Identifier') {
			if (scope !== null) {
				scope.bindings.add(pattern.name);
				if (importSource !== null) scope.importSources.set(pattern.name, importSource);
			}
			bindingNodes.add(pattern);
			return;
		}
		if (pattern.type === 'RestElement') {
			declarePattern(pattern.argument, scope, importSource);
			return;
		}
		if (pattern.type === 'AssignmentPattern') {
			declarePattern(pattern.left, scope, importSource);
			return;
		}
		if (pattern.type === 'TSParameterProperty') {
			declarePattern(pattern.parameter, scope, importSource);
			return;
		}
		if (pattern.type === 'ArrayPattern') {
			for (const element of pattern.elements ?? []) {
				declarePattern(element, scope, importSource);
			}
			return;
		}
		if (pattern.type === 'ObjectPattern') {
			for (const property of pattern.properties ?? []) {
				declarePattern(property.argument ?? property.value, scope, importSource);
			}
		}
	};
	const visitScopes = (node, scope) => {
		if (!node || typeof node !== 'object') return;
		if (Array.isArray(node)) {
			for (const child of node) visitScopes(child, scope);
			return;
		}
		nodeScopes.set(node, scope);

		if (node.type === 'ImportDeclaration') {
			if (node.importKind !== 'type') {
				for (const specifier of node.specifiers ?? []) {
					if (specifier.importKind !== 'type' && specifier.local) {
						declarePattern(specifier.local, scope, node.source);
					}
				}
			}
			forEachRuntimeAstChild(node, (child) => visitScopes(child, scope));
			return;
		}
		if (
			node.type === 'ExportNamedDeclaration' &&
			(node.source != null || node.exportKind === 'type')
		) {
			for (const specifier of node.specifiers ?? []) {
				if (specifier.local) nonReferenceNodes.add(specifier.local);
				if (specifier.exported) nonReferenceNodes.add(specifier.exported);
			}
			forEachRuntimeAstChild(node, (child) => visitScopes(child, scope));
			return;
		}
		if (node.type === 'VariableDeclaration') {
			const bindingScope = node.kind === 'var' ? scope.functionScope : scope;
			for (const declaration of node.declarations ?? []) {
				declarePattern(
					declaration.id,
					node.declare === true ? null : bindingScope,
					node.declare === true ? null : commonJsSource(declaration.init, scope),
				);
			}
			forEachRuntimeAstChild(node, (child) => visitScopes(child, scope));
			return;
		}
		if (
			node.type === 'FunctionDeclaration' ||
			node.type === 'FunctionExpression' ||
			node.type === 'ArrowFunctionExpression'
		) {
			if (node.type === 'FunctionDeclaration' && node.id) declarePattern(node.id, scope);
			const parameterScope = createLexicalScope(scope, true);
			if (node.id) declarePattern(node.id, parameterScope);
			for (const parameter of node.params ?? []) declarePattern(parameter, parameterScope);
			if (node.id) visitScopes(node.id, parameterScope);
			for (const parameter of node.params ?? []) visitScopes(parameter, parameterScope);
			const bodyScope = createLexicalScope(parameterScope, true);
			visitScopes(node.body, bodyScope);
			return;
		}
		if (node.type === 'ClassDeclaration' || node.type === 'ClassExpression') {
			if (node.declare === true) {
				if (node.id) declarePattern(node.id, null);
				return;
			}
			if (node.type === 'ClassDeclaration' && node.id) declarePattern(node.id, scope);
			for (const decorator of node.decorators ?? []) visitScopes(decorator, scope);
			const classScope = createLexicalScope(scope);
			if (node.id) {
				declarePattern(node.id, classScope);
				visitScopes(node.id, classScope);
			}
			visitScopes(node.superClass, classScope);
			visitScopes(node.body, classScope);
			return;
		}
		if (node.type === 'BlockStatement' || node.type === 'JSXCodeBlock') {
			const blockScope = createLexicalScope(scope);
			forEachRuntimeAstChild(node, (child) => visitScopes(child, blockScope));
			return;
		}
		if (node.type === 'StaticBlock') {
			const staticScope = createLexicalScope(scope, true);
			forEachRuntimeAstChild(node, (child) => visitScopes(child, staticScope));
			return;
		}
		if (
			node.type === 'ForStatement' ||
			node.type === 'ForInStatement' ||
			node.type === 'ForOfStatement' ||
			node.type === 'SwitchStatement'
		) {
			const blockScope = createLexicalScope(scope);
			forEachRuntimeAstChild(node, (child) => visitScopes(child, blockScope));
			return;
		}
		if (node.type === 'CatchClause') {
			const catchScope = createLexicalScope(scope);
			declarePattern(node.param, catchScope);
			visitScopes(node.param, catchScope);
			visitScopes(node.body, catchScope);
			return;
		}
		if (node.type === 'JSXForExpression') {
			visitScopes(node.right, scope);
			const itemScope = createLexicalScope(scope);
			if (node.left?.type === 'VariableDeclaration') {
				for (const declaration of node.left.declarations ?? []) {
					declarePattern(declaration.id, itemScope);
				}
			} else {
				declarePattern(node.left, itemScope);
			}
			declarePattern(node.index, itemScope);
			visitScopes(node.left, itemScope);
			visitScopes(node.index, itemScope);
			visitScopes(node.key, itemScope);
			visitScopes(node.body, itemScope);
			visitScopes(node.empty, scope);
			return;
		}
		if (node.type === 'JSXTryExpression') {
			visitScopes(node.block, scope);
			visitScopes(node.pending, scope);
			if (node.handler) {
				const catchScope = createLexicalScope(scope);
				declarePattern(node.handler.param, catchScope);
				declarePattern(node.handler.resetParam, catchScope);
				visitScopes(node.handler.param, catchScope);
				visitScopes(node.handler.resetParam, catchScope);
				visitScopes(node.handler.body, catchScope);
			}
			return;
		}
		if (node.type === 'TSModuleDeclaration') {
			if (node.declare === true || node.global === true) {
				if (node.id) declarePattern(node.id, null);
				return;
			}
			if (node.id) declarePattern(node.id, scope);
			const moduleScope = createLexicalScope(scope, true);
			if (node.id) {
				declarePattern(node.id, moduleScope);
				visitScopes(node.id, moduleScope);
			}
			visitScopes(node.body, moduleScope);
			return;
		}
		if (node.type === 'TSEnumDeclaration') {
			if (node.id) declarePattern(node.id, node.declare === true ? null : scope);
			if (node.declare === true) return;
			const enumScope = createLexicalScope(scope);
			if (node.id) declarePattern(node.id, enumScope);
			for (const member of node.members ?? []) {
				if (member.computed !== true && member.id?.type === 'Identifier') {
					declarePattern(member.id, enumScope);
				}
			}
			forEachRuntimeAstChild(node, (child) => visitScopes(child, enumScope));
			return;
		}
		if (node.type === 'TSImportEqualsDeclaration') {
			if (node.id) {
				declarePattern(
					node.id,
					node.declare === true ? null : scope,
					node.moduleReference?.expression ?? null,
				);
			}
			if (node.declare === true) return;
			forEachRuntimeAstChild(node, (child) => visitScopes(child, scope));
			return;
		}

		forEachRuntimeAstChild(node, (child) => visitScopes(child, scope));
	};
	visitScopes(ast, rootScope);
	const resolveBinding = (scope, name) => {
		for (let current = scope; current; current = current.parent) {
			if (current.bindings.has(name)) {
				return {
					importSource: current.importSources.get(name) ?? null,
					scope: current,
				};
			}
		}
		return null;
	};
	const isBound = (scope, name) => resolveBinding(scope, name) !== null;
	return {
		bindingNodes,
		commonJsSource,
		nonReferenceNodes,
		nodeScopes,
		rootScope,
		isBound,
		resolveBinding,
	};
}

function isIdentifierReference(node, parent, key, lexicalAnalysis) {
	const { bindingNodes, nonReferenceNodes } = lexicalAnalysis;
	if (bindingNodes.has(node) || nonReferenceNodes.has(node)) return false;
	if (
		parent?.type === 'ImportSpecifier' ||
		parent?.type === 'ImportDefaultSpecifier' ||
		parent?.type === 'ImportNamespaceSpecifier'
	) {
		return false;
	}
	if (
		(parent?.type === 'ExportSpecifier' && key === 'exported') ||
		(parent?.type === 'ExportAllDeclaration' && key === 'exported') ||
		parent?.type === 'ExportNamespaceSpecifier'
	) {
		return false;
	}
	if (
		(parent?.type === 'MemberExpression' || parent?.type === 'OptionalMemberExpression') &&
		key === 'property' &&
		!parent.computed
	) {
		return false;
	}
	if (parent?.type === 'Property' && key === 'key' && !parent.computed) {
		return parent.shorthand === true && parent.value === node;
	}
	if (
		(parent?.type === 'MethodDefinition' ||
			parent?.type === 'PropertyDefinition' ||
			parent?.type === 'TSEnumMember') &&
		(key === 'key' || key === 'id') &&
		!parent.computed
	) {
		return false;
	}
	if (parent?.type === 'TSQualifiedName' && key === 'right') return false;
	if (
		(parent?.type === 'LabeledStatement' && key === 'label') ||
		((parent?.type === 'BreakStatement' || parent?.type === 'ContinueStatement') &&
			key === 'label') ||
		(parent?.type === 'ImportAttribute' && key === 'key' && !parent.computed) ||
		parent?.type === 'MetaProperty'
	) {
		return false;
	}
	return true;
}

function threadHash(value) {
	let left = 5381;
	let right = 52711;
	for (let index = 0; index < value.length; index++) {
		const code = value.charCodeAt(index);
		left = (Math.imul(left, 33) + code) | 0;
		right = (Math.imul(right, 31) ^ code) | 0;
	}
	return `${(left >>> 0).toString(36)}${(right >>> 0).toString(36)}`;
}

function compareSourcePosition(left, right) {
	if (left.line !== right.line) return left.line - right.line;
	return left.column - right.column;
}

function isThreadNodeActive(state, node) {
	const ranges = state.threadErasedRanges ?? [];
	const position = node?.loc?.start;
	if (position === undefined || ranges.length === 0) return true;
	let low = 0;
	let high = ranges.length - 1;
	while (low <= high) {
		const middle = (low + high) >>> 1;
		const range = ranges[middle];
		if (compareSourcePosition(position, range.start) < 0) {
			high = middle - 1;
		} else if (compareSourcePosition(position, range.end) >= 0) {
			low = middle + 1;
		} else {
			return false;
		}
	}
	return true;
}

function isThreadImportElided(state, sourceNode) {
	const position = sourceNode?.loc?.start;
	return (
		position !== undefined &&
		(state.threadElidedImportLocations ?? []).some(
			(candidate) => compareSourcePosition(position, candidate) === 0,
		)
	);
}

function scopeContains(scope, boundary) {
	for (let current = scope; current; current = current.parent) {
		if (current === boundary) return true;
	}
	return false;
}

function threadFunctionCaptures(site, state, lexicalAnalysis) {
	const { fn, directive } = site;
	const { nodeScopes, resolveBinding, rootScope } = lexicalAnalysis;
	const bodyScope = nodeScopes.get(fn.body);
	const functionBoundary = bodyScope?.parent ?? bodyScope;
	const captures = new Map();
	const seen = new WeakSet();
	const visit = (node, parent = null, key = null) => {
		if (!node || typeof node !== 'object') return;
		if (Array.isArray(node)) {
			for (const child of node) visit(child, parent, key);
			return;
		}
		if (seen.has(node)) return;
		seen.add(node);
		if (node === directive) return;
		if (isTemplateNode(node)) {
			throw universalError(
				state.filename,
				node,
				'thread functions cannot contain JSX or TSRX template syntax.',
			);
		}
		if (node.type === 'ThisExpression' || node.type === 'Super') {
			throw universalError(
				state.filename,
				node,
				'thread functions cannot reference this or super; pass serializable values explicitly.',
			);
		}
		if (
			node.type === 'MetaProperty' &&
			node.meta?.name === 'new' &&
			node.property?.name === 'target'
		) {
			throw universalError(state.filename, node, 'thread functions cannot reference new.target.');
		}
		if (
			node.type === 'Identifier' &&
			node.name === 'arguments' &&
			isIdentifierReference(node, parent, key, lexicalAnalysis)
		) {
			throw universalError(
				state.filename,
				node,
				'thread functions cannot capture arguments; use an explicit rest parameter.',
			);
		}
		if (node.type === 'CallExpression' && node.callee?.type === 'Identifier') {
			const binding = resolveBinding(nodeScopes.get(node.callee) ?? rootScope, node.callee.name);
			if (node.callee.name === 'eval' && binding === null) {
				throw universalError(
					state.filename,
					node.callee,
					'thread functions cannot call direct eval.',
				);
			}
			const imported = state.runtimeImports.get(node.callee.name);
			if (imported === 'use' || /^use[A-Z]/.test(imported ?? node.callee.name)) {
				throw universalError(state.filename, node.callee, 'thread functions cannot call hooks.');
			}
		}
		if (node.type === 'Identifier' && isIdentifierReference(node, parent, key, lexicalAnalysis)) {
			const binding = resolveBinding(nodeScopes.get(node) ?? rootScope, node.name);
			if (
				(binding === null && state.threadExternalCaptures?.has(node.name)) ||
				(binding !== null &&
					binding.scope !== rootScope &&
					!scopeContains(binding.scope, functionBoundary))
			) {
				const existing = captures.get(node.name);
				if (existing === undefined || (node.start ?? Infinity) < existing.offset) {
					captures.set(node.name, { name: node.name, offset: node.start ?? Infinity });
				}
			}
		}
		forEachRuntimeAstChild(node, (child, childKey) => visit(child, node, childKey));
	};
	for (const parameter of fn.params ?? []) visit(parameter, fn, 'params');
	visit(fn.body, fn, 'body');
	return [...captures.values()].sort((left, right) => left.offset - right.offset);
}

function threadFunctionSource(site, state) {
	const { fn, directive } = site;
	const source = state.source.slice(fn.start, fn.end);
	return source.slice(0, directive.start - fn.start) + source.slice(directive.end - fn.start);
}

function rewriteThreadImport(node, specifiers, state) {
	const defaultSpecifier = specifiers.find(
		(specifier) => specifier.type === 'ImportDefaultSpecifier',
	);
	const namespaceSpecifier = specifiers.find(
		(specifier) => specifier.type === 'ImportNamespaceSpecifier',
	);
	const namedSpecifiers = specifiers.filter((specifier) => specifier.type === 'ImportSpecifier');
	const parts = [];
	if (defaultSpecifier) parts.push(defaultSpecifier.local.name);
	if (namespaceSpecifier) parts.push(`* as ${namespaceSpecifier.local.name}`);
	if (namedSpecifiers.length > 0) {
		parts.push(
			`{ ${namedSpecifiers
				.map((specifier) => {
					const imported = state.source.slice(specifier.imported.start, specifier.imported.end);
					const local = specifier.local.name;
					const binding = imported === local ? imported : `${imported} as ${local}`;
					return specifier.importKind === 'type' ? `type ${binding}` : binding;
				})
				.join(', ')} }`,
		);
	}
	const sourceAndAttributes = state.source.slice(node.source.start, node.end);
	return `import${node.importKind === 'type' ? ' type' : ''} ${parts.join(
		', ',
	)} from ${sourceAndAttributes}`;
}

function keepThreadImportBinding(references, source, name) {
	const counts = references.get(source)?.get(name);
	return counts === undefined || counts.total === 0 || counts.active > 0;
}

function isStaticThreadImportSource(source) {
	return source?.type === 'Literal' && typeof source.value === 'string';
}

function rewriteThreadVariableDeclaration(node, declarations, state) {
	const first = node.declarations?.[0];
	const last = node.declarations?.at(-1);
	if (first === undefined || last === undefined) return rewriteSourceNode(node, state);
	return (
		state.source.slice(node.start, first.start) +
		declarations.map((declaration) => rewriteSourceNode(declaration, state)).join(', ') +
		state.source.slice(last.end, node.end)
	);
}

function prepareThreadFunctionReplacements(ast, state) {
	if (!rendererHasCapability(state, THREAD_FUNCTION_CAPABILITY)) return;
	const parents = new WeakMap();
	const directives = [];
	const seen = new WeakSet();
	const visit = (node, parent = null, key = null) => {
		if (!node || typeof node !== 'object') return;
		if (Array.isArray(node)) {
			for (const child of node) visit(child, parent, key);
			return;
		}
		if (seen.has(node)) return;
		seen.add(node);
		if (parent !== null) parents.set(node, parent);
		if (
			node.type === 'ExpressionStatement' &&
			THREAD_DIRECTIVES.has(node.directive ?? node.expression?.value)
		) {
			directives.push(node);
		}
		forEachRuntimeAstChild(node, (child, childKey) => visit(child, node, childKey));
	};
	visit(ast);
	if (directives.length === 0) return;

	const sites = [];
	for (const directive of directives.sort((left, right) => left.start - right.start)) {
		const directiveValue = directive.directive ?? directive.expression.value;
		let fn = parents.get(directive);
		while (
			fn &&
			fn.type !== 'FunctionDeclaration' &&
			fn.type !== 'FunctionExpression' &&
			fn.type !== 'ArrowFunctionExpression'
		) {
			fn = parents.get(fn);
		}
		if (!fn || fn.body?.type !== 'BlockStatement' || fn.body.body?.[0] !== directive) {
			throw universalError(
				state.filename,
				directive,
				`${JSON.stringify(directiveValue)} must be the first statement of a function body.`,
			);
		}
		const parent = parents.get(fn);
		if (
			parent?.type === 'MethodDefinition' ||
			(parent?.type === 'Property' && (parent.method === true || parent.kind !== 'init'))
		) {
			throw universalError(
				state.filename,
				directive,
				'thread directives are not supported in methods, getters, setters, or constructors; use a function-valued field or declaration.',
			);
		}
		let declarationContainer = null;
		if (fn.type === 'FunctionDeclaration') {
			const declarationParent = parents.get(fn);
			declarationContainer =
				declarationParent?.type === 'ExportNamedDeclaration' ||
				declarationParent?.type === 'ExportDefaultDeclaration'
					? parents.get(declarationParent)
					: declarationParent;
			if (
				declarationContainer?.type !== 'Program' &&
				declarationContainer?.type !== 'BlockStatement' &&
				declarationContainer?.type !== 'JSXCodeBlock'
			) {
				throw universalError(
					state.filename,
					directive,
					'thread function declarations require a module or block statement container.',
				);
			}
		}
		const kind = THREAD_DIRECTIVES.get(directiveValue);
		if (fn.generator || (kind === 'main-thread' && fn.async)) {
			throw universalError(
				state.filename,
				directive,
				kind === 'main-thread' && fn.async
					? 'main-thread functions cannot be async functions.'
					: 'thread functions cannot be generator functions.',
			);
		}
		sites.push({
			fn,
			directive,
			kind,
			declarationContainer,
		});
	}

	for (let index = 0; index < sites.length; index++) {
		const outer = sites[index];
		for (let nestedIndex = index + 1; nestedIndex < sites.length; nestedIndex++) {
			const nested = sites[nestedIndex];
			if (nested.fn.start >= outer.fn.end) break;
			if (nested.fn.end <= outer.fn.end) {
				throw universalError(
					state.filename,
					nested.directive,
					'thread functions cannot contain another thread function.',
				);
			}
		}
	}

	if (state.universalRuntime === undefined) {
		throw universalError(
			state.filename,
			sites[0].directive,
			'thread directives require universalRuntime.thread to select the current execution layer.',
		);
	}

	state.sourceNodeReplacements ??= new WeakMap();
	state.threadFunctionNodes = new WeakSet(sites.map((site) => site.fn));
	state.threadFunctionRegistrations = [];
	state.threadErasedRanges = sites
		.filter((site) => site.kind !== state.universalRuntime.thread)
		.map((site) => ({ start: site.fn.loc?.start, end: site.fn.loc?.end }))
		.sort((left, right) => compareSourcePosition(left.start, right.start));
	if (sites.some((site) => site.kind === state.universalRuntime.thread)) {
		state.helpers.registerThreadFunction = allocName(
			state,
			`${state.planPrefix ?? '__octane'}RegisterThreadFunction`,
		);
	}
	if (sites.some((site) => site.fn.type !== 'FunctionDeclaration')) {
		state.helpers.bindThreadFunction = allocName(
			state,
			`${state.planPrefix ?? '__octane'}BindThreadFunction`,
		);
	}
	if (sites.some((site) => site.fn.type === 'FunctionDeclaration')) {
		state.helpers.attachThreadFunction = allocName(
			state,
			`${state.planPrefix ?? '__octane'}AttachThreadFunction`,
		);
		state.helpers.invokeThreadFunction = allocName(
			state,
			`${state.planPrefix ?? '__octane'}InvokeThreadFunction`,
		);
	}
	const captureParameter = allocName(state, '__octaneThreadCaptures');
	const receiverParameter = allocName(state, '__octaneThreadReceiver');
	const argumentParameter = allocName(state, '__octaneThreadArguments');
	const wrapperArguments = allocName(state, '__octaneThreadCallArguments');
	const lexicalAnalysis = createLexicalAnalysis(ast);

	for (const site of sites) {
		const captures = threadFunctionCaptures(site, state, lexicalAnalysis);
		const strippedSource = threadFunctionSource(site, state);
		const loc = site.fn.loc?.start;
		// Function bodies change during live definition reloads. Keep the site ID
		// anchored to module/location so re-registration revises the same runtime
		// definition and existing activations become inert.
		const id = `tf_${threadHash(
			`${state.profileFilename || state.filename || '<anon>'}\0${site.kind}\0${loc?.line ?? 0}:${
				loc?.column ?? 0
			}`,
		)}`;
		const metadata = JSON.stringify({
			file: (state.profileFilename || state.filename || '<anon>').split(/[\\/]/).pop(),
			line: loc?.line ?? 0,
			column: loc?.column ?? 0,
		});
		const captureValues = `[${captures.map((capture) => capture.name).join(', ')}]`;
		const captureProvider = `() => ${captureValues}`;
		const helperArguments = `${JSON.stringify(site.kind)}, ${JSON.stringify(id)}, ${captureProvider}, ${metadata}`;
		Object.assign(site, { captures, strippedSource, id, metadata, helperArguments });
	}

	const declarationAttachments = new Map();
	for (const site of sites) {
		const { captures, strippedSource, id, metadata, helperArguments } = site;
		if (site.fn.type === 'FunctionDeclaration') {
			let name = site.fn.id?.name;
			if (!name) name = allocName(state, '__octaneThreadDefault');
			const attachment = `${state.helpers.attachThreadFunction}(${name}, ${helperArguments});`;
			const wrapper =
				`function ${name}(...${wrapperArguments}) { ` +
				`${attachment} ` +
				`return ${state.helpers.invokeThreadFunction}(${name}, this, ${wrapperArguments}); }`;
			state.sourceNodeReplacements.set(site.fn, wrapper);
			let attachments = declarationAttachments.get(site.declarationContainer);
			if (attachments === undefined) {
				attachments = [];
				declarationAttachments.set(site.declarationContainer, attachments);
			}
			attachments.push(attachment);
		} else {
			state.sourceNodeReplacements.set(
				site.fn,
				`${state.helpers.bindThreadFunction}(${helperArguments})`,
			);
		}
		if (site.kind === state.universalRuntime.thread) {
			const captureSetup =
				captures.length === 0
					? ''
					: `let [${captures.map((capture) => capture.name).join(', ')}] = ${captureParameter}; `;
			state.threadFunctionRegistrations.push(
				`${state.helpers.registerThreadFunction}(${JSON.stringify(site.kind)}, ${JSON.stringify(
					id,
				)}, function (${captureParameter}, ${receiverParameter}, ${argumentParameter}) { ${captureSetup}return (${strippedSource}).apply(${receiverParameter}, ${argumentParameter}); }, ${metadata});`,
			);
		}
	}
	state.sourceNodePrefixes ??= new WeakMap();
	for (const [container, attachments] of declarationAttachments) {
		const prefix = `${attachments.join(' ')}\n`;
		if (container?.type === 'Program') {
			state.threadFunctionRegistrations.push(prefix);
			continue;
		}
		const firstStatement = (container?.body ?? []).find(
			(statement) => statement?.type !== 'ExpressionStatement' || statement.directive === undefined,
		);
		if (firstStatement === undefined) continue;
		state.sourceNodePrefixes.set(
			firstStatement,
			(state.sourceNodePrefixes.get(firstStatement) ?? '') + prefix,
		);
	}

	const importReferences = new Map();
	const visitImportReferences = (node, parent = null, key = null) => {
		if (!node || typeof node !== 'object') return;
		if (Array.isArray(node)) {
			for (const child of node) visitImportReferences(child, parent, key);
			return;
		}
		if (
			(node.type === 'Identifier' && isIdentifierReference(node, parent, key, lexicalAnalysis)) ||
			isJsxBindingReference(node, parent, key)
		) {
			const binding = lexicalAnalysis.resolveBinding(
				lexicalAnalysis.nodeScopes.get(node) ?? lexicalAnalysis.rootScope,
				node.name,
			);
			if (binding?.importSource) {
				let references = importReferences.get(binding.importSource);
				if (references === undefined) {
					references = new Map();
					importReferences.set(binding.importSource, references);
				}
				const counts = references.get(node.name) ?? { active: 0, total: 0 };
				counts.total++;
				if (isThreadNodeActive(state, node)) counts.active++;
				references.set(node.name, counts);
			}
		}
		forEachRuntimeAstChild(node, (child, childKey) => visitImportReferences(child, node, childKey));
	};
	visitImportReferences(ast);
	state.threadElidedImportLocations = [];
	for (const node of ast.body ?? []) {
		if (node.type === 'ImportDeclaration' && (node.specifiers?.length ?? 0) > 0) {
			const keptSpecifiers = (node.specifiers ?? []).filter((specifier) => {
				if (node.importKind === 'type' || specifier.importKind === 'type') return true;
				return keepThreadImportBinding(importReferences, node.source, specifier.local?.name);
			});
			if (keptSpecifiers.length === (node.specifiers ?? []).length) continue;
			if (keptSpecifiers.length === 0) {
				state.sourceNodeReplacements.set(node, '');
				if (node.source?.loc?.start) state.threadElidedImportLocations.push(node.source.loc.start);
			} else {
				state.sourceNodeReplacements.set(node, rewriteThreadImport(node, keptSpecifiers, state));
			}
			continue;
		}
		if (node.type === 'TSImportEqualsDeclaration') {
			const source = node.moduleReference?.expression;
			if (
				node.isExport !== true &&
				isStaticThreadImportSource(source) &&
				!keepThreadImportBinding(importReferences, source, node.id?.name)
			) {
				state.sourceNodeReplacements.set(node, '');
				if (source.loc?.start) state.threadElidedImportLocations.push(source.loc.start);
			}
			continue;
		}
		if (node.type === 'VariableDeclaration' && node.declare !== true) {
			const removedSources = [];
			const keptDeclarations = (node.declarations ?? []).filter((declaration) => {
				const source = lexicalAnalysis.commonJsSource(
					declaration.init,
					lexicalAnalysis.nodeScopes.get(declaration.init) ?? lexicalAnalysis.rootScope,
				);
				if (!isStaticThreadImportSource(source)) return true;
				const names = new Set();
				addPatternNames(declaration.id, names);
				if (
					names.size === 0 ||
					[...names].some((name) => keepThreadImportBinding(importReferences, source, name))
				) {
					return true;
				}
				removedSources.push(source);
				return false;
			});
			if (keptDeclarations.length === (node.declarations ?? []).length) continue;
			state.sourceNodeReplacements.set(
				node,
				keptDeclarations.length === 0
					? ''
					: rewriteThreadVariableDeclaration(node, keptDeclarations, state),
			);
			for (const source of removedSources) {
				if (source.loc?.start) state.threadElidedImportLocations.push(source.loc.start);
			}
		}
	}
}

function isJsxBindingReference(node, parent, key) {
	if (node.type !== 'JSXIdentifier') return false;
	if (
		(parent?.type === 'JSXOpeningElement' || parent?.type === 'JSXClosingElement') &&
		key === 'name'
	) {
		return !/^[a-z]/.test(node.name) && !node.name.includes('-');
	}
	return parent?.type === 'JSXMemberExpression' && key === 'object';
}

function referencedImportSources(ast, lexicalAnalysis, isAuthored, isActive = () => true) {
	const { nodeScopes, resolveBinding, rootScope } = lexicalAnalysis;
	const sources = new Set();
	const seen = new WeakSet();
	const visit = (node, parent = null, key = null) => {
		if (!node || typeof node !== 'object') return;
		if (Array.isArray(node)) {
			for (const child of node) visit(child, parent, key);
			return;
		}
		if (seen.has(node)) return;
		seen.add(node);
		if (!isActive(node)) return;
		if (
			isAuthored(node) &&
			((node.type === 'Identifier' && isIdentifierReference(node, parent, key, lexicalAnalysis)) ||
				isJsxBindingReference(node, parent, key))
		) {
			const binding = resolveBinding(nodeScopes.get(node) ?? rootScope, node.name);
			if (binding?.importSource !== null && binding?.importSource !== undefined) {
				sources.add(binding.importSource);
			}
		}
		forEachRuntimeAstChild(node, (child, childKey) => visit(child, node, childKey));
	};
	visit(ast);
	return sources;
}

function importSourceRanges(sources) {
	return [...sources]
		.filter((source) => typeof source.start === 'number' && typeof source.end === 'number')
		.map((source) => Object.freeze({ end: source.end, start: source.start }))
		.sort((left, right) => left.start - right.start || left.end - right.end);
}

/**
 * Find static import sources whose runtime bindings are referenced by the
 * authored offsets represented in a renderer-region origin map.
 */
export function rendererValidationImportReferences(source, filename, origins) {
	const ast = parseModule(source, filename);
	const lexicalAnalysis = createLexicalAnalysis(ast);
	const isAuthored = originalNodePredicate(origins, source.length);
	return Object.freeze(
		importSourceRanges(referencedImportSources(ast, lexicalAnalysis, isAuthored)),
	);
}

/** Validate a renderer-selected helper module without compiling or rewriting it. */
export function validateRendererModuleSource(source, filename, renderer) {
	if (renderer?.validation === undefined) return;
	const ast = parseModule(source, filename);
	validateRendererSource(ast, { filename, renderer });
}

function validateForbiddenGlobals(ast, state, validation, isAuthored, lexicalAnalysis = null) {
	const forbidden = new Set(validation.forbiddenGlobals ?? []);
	if (forbidden.size === 0) return;
	const analysis = lexicalAnalysis ?? createLexicalAnalysis(ast);
	const { nodeScopes, rootScope, isBound } = analysis;
	const references = [];
	const seen = new WeakSet();
	const visitReferences = (node, parent = null, key = null) => {
		if (!node || typeof node !== 'object') return;
		if (Array.isArray(node)) {
			for (const child of node) visitReferences(child, parent, key);
			return;
		}
		if (seen.has(node)) return;
		seen.add(node);
		if (!isThreadNodeActive(state, node)) return;
		const scope = nodeScopes.get(node) ?? rootScope;
		if (
			node.type === 'Identifier' &&
			forbidden.has(node.name) &&
			isAuthored(node) &&
			isIdentifierReference(node, parent, key, analysis) &&
			!isBound(scope, node.name)
		) {
			references.push({ name: node.name, node });
		}
		if (
			(node.type === 'MemberExpression' || node.type === 'OptionalMemberExpression') &&
			node.object?.type === 'Identifier' &&
			node.object.name === 'globalThis' &&
			!isBound(nodeScopes.get(node.object) ?? scope, 'globalThis')
		) {
			const name = node.computed ? node.property?.value : node.property?.name;
			if (typeof name === 'string' && forbidden.has(name) && isAuthored(node.property ?? node)) {
				references.push({ name, node: node.property ?? node });
			}
		}
		forEachRuntimeAstChild(node, (child, childKey) => visitReferences(child, node, childKey));
	};
	visitReferences(ast);
	if (references.length > 0) {
		references.sort((left, right) => (left.node.start ?? 0) - (right.node.start ?? 0));
		const reference = references[0];
		throw universalError(
			state.filename,
			reference.node,
			`renderer ${JSON.stringify(state.renderer.id)} forbids unbound global ${JSON.stringify(reference.name)}.`,
		);
	}
}

function hostPropMatches(name, pattern) {
	return pattern.endsWith('*') ? name.startsWith(pattern.slice(0, -1)) : name === pattern;
}

function validationAttributeName(attribute) {
	const direct = attributeName(attribute);
	if (direct !== null) return direct;
	const name = attribute?.name;
	if (name?.type !== 'JSXNamespacedName') return null;
	const namespace = name.namespace?.name;
	const local = name.name?.name;
	return typeof namespace === 'string' && typeof local === 'string'
		? `${namespace}:${local}`
		: null;
}

function isStaticallyPrimitiveTextExpression(node) {
	if (!node || typeof node !== 'object') return false;
	if (
		node.type === 'ParenthesizedExpression' ||
		node.type === 'ChainExpression' ||
		node.type === 'TSNonNullExpression' ||
		node.type === 'TSSatisfiesExpression'
	) {
		return isStaticallyPrimitiveTextExpression(node.expression);
	}
	if (node.type === 'TSAsExpression' || node.type === 'TSTypeAssertion') {
		if (
			node.typeAnnotation?.type === 'TSStringKeyword' ||
			node.typeAnnotation?.type === 'TSNumberKeyword' ||
			node.typeAnnotation?.type === 'TSBigIntKeyword'
		) {
			return true;
		}
		return isStaticallyPrimitiveTextExpression(node.expression);
	}
	if (node.type === 'Literal') {
		return (
			typeof node.value === 'string' ||
			typeof node.value === 'number' ||
			typeof node.value === 'bigint'
		);
	}
	if (node.type === 'TemplateLiteral' || node.type === 'UpdateExpression') return true;
	if (node.type === 'UnaryExpression') {
		return (
			node.operator === '+' ||
			node.operator === '-' ||
			node.operator === '~' ||
			node.operator === 'typeof'
		);
	}
	if (node.type === 'BinaryExpression') {
		return ['+', '-', '*', '/', '%', '**', '<<', '>>', '>>>', '&', '|', '^'].includes(
			node.operator,
		);
	}
	if (node.type === 'ConditionalExpression') {
		return (
			isStaticallyPrimitiveTextExpression(node.consequent) &&
			isStaticallyPrimitiveTextExpression(node.alternate)
		);
	}
	if (node.type === 'SequenceExpression') {
		return isStaticallyPrimitiveTextExpression(node.expressions?.at(-1));
	}
	return false;
}

function validateHostTemplates(ast, state, validation, isAuthored) {
	const textParents = validation.textParents === undefined ? null : new Set(validation.textParents);
	const textHosts = validation.textHosts === undefined ? null : new Set(validation.textHosts);
	const hostProps = validation.hostProps;
	if (textParents === null && textHosts === null && hostProps === undefined) return;
	const sharedProps = hostProps?.['*'] ?? [];
	const seen = new WeakSet();
	const visit = (node, nearestHost = null) => {
		if (!node || typeof node !== 'object') return;
		if (Array.isArray(node)) {
			for (const child of node) visit(child, nearestHost);
			return;
		}
		if (seen.has(node)) return;
		seen.add(node);
		if (node.type === 'JSXText') {
			if (
				textParents !== null &&
				nearestHost !== null &&
				isAuthored(node) &&
				normalizeJsxText(node.value ?? '') !== '' &&
				!textParents.has(nearestHost)
			) {
				throw universalError(
					state.filename,
					node,
					`renderer ${JSON.stringify(state.renderer.id)} does not allow authored JSX text under <${nearestHost}>.`,
				);
			}
			return;
		}
		if (node.type === 'JSXExpressionContainer') {
			if (
				textParents !== null &&
				nearestHost !== null &&
				!textParents.has(nearestHost) &&
				isAuthored(node) &&
				isStaticallyPrimitiveTextExpression(node.expression)
			) {
				throw universalError(
					state.filename,
					node.expression,
					`renderer ${JSON.stringify(state.renderer.id)} does not allow authored primitive text under <${nearestHost}>.`,
				);
			}
			visit(node.expression, nearestHost);
			return;
		}
		if (node.type === 'JSXElement' || node.type === 'Element') {
			const name = jsxName(node);
			const isHost = name !== null && /^[a-z]/.test(name) && !isComponentElement(node);
			// A component owns the eventual placement of its children. Do not carry
			// the caller's nearest host through that semantic boundary; the component
			// body is validated independently at the host site it actually authors.
			const nextHost = isHost ? name : null;
			if (
				isHost &&
				textHosts !== null &&
				textHosts.has(name) &&
				nearestHost !== null &&
				(textParents === null || !textParents.has(nearestHost)) &&
				isAuthored(node)
			) {
				throw universalError(
					state.filename,
					node,
					`renderer ${JSON.stringify(state.renderer.id)} does not allow <${name}> under <${nearestHost}>.`,
				);
			}
			const attributes = node.openingElement?.attributes ?? node.attributes ?? [];
			if (isHost && hostProps !== undefined && Object.hasOwn(hostProps, name)) {
				const tagProps = hostProps[name];
				for (const attribute of attributes) {
					if (
						attribute.type === 'JSXSpreadAttribute' ||
						attribute.type === 'SpreadAttribute' ||
						!isAuthored(attribute)
					) {
						continue;
					}
					const attributeValue = validationAttributeName(attribute);
					if (
						attributeValue === null ||
						attributeValue === 'key' ||
						attributeValue === 'children' ||
						sharedProps.some((pattern) => hostPropMatches(attributeValue, pattern)) ||
						tagProps.some((pattern) => hostPropMatches(attributeValue, pattern))
					) {
						continue;
					}
					throw universalError(
						state.filename,
						attribute,
						`renderer ${JSON.stringify(state.renderer.id)} does not allow static attribute ${JSON.stringify(attributeValue)} on <${name}>.`,
					);
				}
			}
			for (const attribute of attributes) {
				if (attribute.type === 'JSXSpreadAttribute' || attribute.type === 'SpreadAttribute') {
					visit(attribute.argument, null);
					continue;
				}
				const attributeHost =
					isHost && validationAttributeName(attribute) === 'children' ? nextHost : null;
				visit(attribute.value, attributeHost);
			}
			visit(node.children ?? [], nextHost);
			return;
		}
		if (node.type === 'JSXFragment' || node.type === 'Fragment') {
			visit(node.children ?? [], nearestHost);
			return;
		}
		forEachRuntimeAstChild(node, (child) => visit(child, nearestHost));
	};
	visit(ast);
}

function validateRendererSource(ast, state, origins = null) {
	const validation = state.renderer.validation;
	if (validation === undefined) return;
	const isAuthored = authoredNodePredicate(origins);
	const needsLexicalAnalysis =
		(validation.forbiddenImports?.length ?? 0) > 0 ||
		(validation.forbiddenGlobals?.length ?? 0) > 0;
	const lexicalAnalysis = needsLexicalAnalysis ? createLexicalAnalysis(ast) : null;
	validateForbiddenImports(ast, state, validation, isAuthored, lexicalAnalysis);
	validateForbiddenGlobals(ast, state, validation, isAuthored, lexicalAnalysis);
	validateHostTemplates(ast, state, validation, isAuthored);
}

function validateLoweredRendererSource(ast, state, origins, authoredSource) {
	const validation = state.renderer.validation;
	if (validation === undefined) return;
	const isSyntheticAuthored = authoredNodePredicate(origins);
	if (
		typeof authoredSource === 'string' &&
		((validation.forbiddenImports?.length ?? 0) > 0 ||
			(validation.forbiddenGlobals?.length ?? 0) > 0)
	) {
		const authoredAst = parseModule(authoredSource, state.filename);
		const lexicalAnalysis = createLexicalAnalysis(authoredAst);
		const isOriginalAuthored = originalNodePredicate(origins, authoredSource.length);
		const referencedStaticSources = referencedImportSources(
			authoredAst,
			lexicalAnalysis,
			isOriginalAuthored,
			(node) => isThreadNodeActive(state, node),
		);
		state.validationImportReferences = importSourceRanges(referencedStaticSources);
		validateForbiddenImports(
			authoredAst,
			state,
			validation,
			isOriginalAuthored,
			lexicalAnalysis,
			referencedStaticSources,
		);
		validateForbiddenGlobals(authoredAst, state, validation, isOriginalAuthored, lexicalAnalysis);
	} else {
		const needsLexicalAnalysis =
			(validation.forbiddenImports?.length ?? 0) > 0 ||
			(validation.forbiddenGlobals?.length ?? 0) > 0;
		const lexicalAnalysis = needsLexicalAnalysis ? createLexicalAnalysis(ast) : null;
		validateForbiddenImports(ast, state, validation, isSyntheticAuthored, lexicalAnalysis);
		validateForbiddenGlobals(ast, state, validation, isSyntheticAuthored, lexicalAnalysis);
	}
	validateHostTemplates(ast, state, validation, isSyntheticAuthored);
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

function hostAttributeName(attribute, state) {
	const direct = attributeName(attribute);
	if (direct !== null) return direct;
	const name = attribute?.name;
	if (
		!rendererHasCapability(state, THREAD_FUNCTION_CAPABILITY) ||
		name?.type !== 'JSXNamespacedName' ||
		name.namespace?.name !== 'main-thread' ||
		typeof name.name?.name !== 'string'
	) {
		return null;
	}
	return `main-thread:${name.name.name}`;
}

function canonicalHostAttributeName(name, canonicalizeHostClass) {
	return canonicalizeHostClass && name === 'className' ? 'class' : name;
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
	const lexicalAnalysis = createLexicalAnalysis(expression);
	const { nodeScopes, resolveBinding, rootScope } = lexicalAnalysis;
	const found = new Map();
	const visit = (node, parent = null, key = null) => {
		if (!node || typeof node !== 'object') return;
		if (Array.isArray(node)) {
			for (const child of node) visit(child, parent, key);
			return;
		}
		if (node.type === 'Identifier' && isIdentifierReference(node, parent, key, lexicalAnalysis)) {
			if (
				resolveBinding(nodeScopes.get(node) ?? rootScope, node.name) === null &&
				!excluded.has(node.name)
			) {
				const entry = found.get(node.name) ?? { offset: Infinity, nodes: [] };
				entry.offset = Math.min(entry.offset, node.start ?? Infinity);
				entry.nodes.push(node);
				found.set(node.name, entry);
			}
			return;
		}
		forEachRuntimeAstChild(node, (child, childKey) => visit(child, node, childKey));
	};
	visit(expression);
	return [...found]
		.sort((left, right) => left[1].offset - right[1].offset)
		.map(([source, entry]) => ({ source, nodes: entry.nodes }));
}

function authoredReferenceBindingMap(source, filename) {
	const ast = parseModule(source, filename);
	const lexicalAnalysis = createLexicalAnalysis(ast);
	const { nodeScopes, resolveBinding, rootScope } = lexicalAnalysis;
	const bindings = new Map();
	const seen = new WeakSet();
	const visit = (node, parent = null, key = null) => {
		if (!node || typeof node !== 'object') return;
		if (Array.isArray(node)) {
			for (const child of node) visit(child, parent, key);
			return;
		}
		if (seen.has(node)) return;
		seen.add(node);
		if (
			node.type === 'Identifier' &&
			typeof node.start === 'number' &&
			isIdentifierReference(node, parent, key, lexicalAnalysis)
		) {
			const binding = resolveBinding(nodeScopes.get(node) ?? rootScope, node.name);
			bindings.set(
				`${node.start}:${node.name}`,
				binding === null ? 'global' : binding.scope === rootScope ? 'module' : 'local',
			);
		}
		forEachRuntimeAstChild(node, (child, childKey) => visit(child, node, childKey));
	};
	visit(ast);
	return bindings;
}

function captureHasAuthoredBinding(capture, origins, bindings) {
	for (const node of capture.nodes) {
		for (let offset = node.start ?? 0; offset < (node.end ?? node.start ?? 0); offset++) {
			const original = origins[offset] ?? -1;
			if (original < 0) continue;
			const bound = bindings.get(`${original}:${capture.source}`);
			if (bound !== undefined) return bound;
		}
	}
	return null;
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

function compileProps(
	attributes,
	childrenExpression,
	state,
	canonicalizeHostClass = false,
	host = false,
) {
	const entries = [];
	for (const attribute of attributes) {
		if (attribute.type === 'JSXSpreadAttribute' || attribute.type === 'SpreadAttribute') {
			entries.push(`['spread', (${printDynamicExpression(attribute.argument, state)})]`);
			continue;
		}
		const rawName = host ? hostAttributeName(attribute, state) : attributeName(attribute);
		const name = canonicalHostAttributeName(rawName, canonicalizeHostClass);
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
				`['set', ${JSON.stringify(name)}, (${mainThreadHostValue(name, value.expression, state)})]`,
			);
			continue;
		}
		throw universalError(state.filename, attribute, `unsupported value for JSX attribute ${name}.`);
	}
	return `${state.helpers.props}([${entries.join(', ')}]${
		childrenExpression === null
			? canonicalizeHostClass
				? ', undefined'
				: ''
			: `, ${childrenExpression}`
	}${canonicalizeHostClass ? ', true' : ''})`;
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

function compileAttribute(attribute, context, state, canonicalizeHostClass) {
	if (attribute.type === 'JSXSpreadAttribute' || attribute.type === 'SpreadAttribute') {
		throw universalError(
			state.filename,
			attribute,
			'host spreads require the ordered universal prop program.',
		);
	}
	const name = canonicalHostAttributeName(
		hostAttributeName(attribute, state),
		canonicalizeHostClass,
	);
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
		context.values.push(mainThreadHostValue(name, value.expression, state));
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
	if (isMainThreadRenderOnly(state)) {
		const spread = attributes.find(
			(attribute) =>
				attribute.type === 'JSXSpreadAttribute' || attribute.type === 'SpreadAttribute',
		);
		if (spread !== undefined) {
			throw universalError(
				state.filename,
				spread,
				'main-thread render-only host spreads are unsupported because first-screen event and ref props must be statically named for callback erasure; expand the spread into explicit host props.',
			);
		}
	}
	const canonicalizeHostClass = rendererHasCapability(state, 'class-name-alias');
	const readAttributeName = (attribute) => hostAttributeName(attribute, state);
	const needsOrderedProps =
		attributes.some(
			(attribute) =>
				attribute.type === 'JSXSpreadAttribute' ||
				attribute.type === 'SpreadAttribute' ||
				readAttributeName(attribute) === 'key' ||
				readAttributeName(attribute) === 'children',
		) ||
		new Set(
			attributes
				.map(readAttributeName)
				.map((name) => canonicalHostAttributeName(name, canonicalizeHostClass))
				.filter(Boolean),
		).size !== attributes.filter((attribute) => readAttributeName(attribute) !== null).length;
	const props = {};
	const bindings = [];
	let propsSlot = null;
	if (needsOrderedProps) {
		propsSlot = context.values.length;
		context.values.push(compileProps(attributes, null, state, canonicalizeHostClass, true));
	} else {
		for (const attribute of attributes) {
			const compiled = compileAttribute(attribute, context, state, canonicalizeHostClass);
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

function threadHelperImports(state) {
	return [
		['registerThreadFunction', state.helpers.registerThreadFunction],
		['bindThreadFunction', state.helpers.bindThreadFunction],
		['attachThreadFunction', state.helpers.attachThreadFunction],
		['invokeThreadFunction', state.helpers.invokeThreadFunction],
	]
		.filter(([, local]) => local !== undefined)
		.map(([imported, local]) => `${imported} as ${local}`)
		.join(', ');
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
	if (state.threadFunctionNodes?.has(statement)) return null;
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
			code:
				component === null
					? rewriteSetupStatement(statement, state)
					: (state.sourceNodePrefixes?.get(statement) ?? '') + component,
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
		return (
			(state.sourceNodePrefixes?.get(statement) ?? '') +
			emitComponent({ ...variable, exportKind: null }, state.source, state)
		);
	}
	return rewriteSourceNode(statement, state);
}

// This proof deliberately covers data expressions, not arbitrary authored calls.
// Property reads can still reach getters or proxies, so the universal runtime
// lazily claims the keyed item owner if one invokes a hook or renderer region.
function isOwnerFreeForExpression(node) {
	if (!node || typeof node !== 'object') return false;
	if (node.type === 'Literal' || node.type === 'Identifier') return true;
	if (node.type === 'ArrayExpression') {
		return (node.elements ?? []).every(
			(element) =>
				element !== null && element.type !== 'SpreadElement' && isOwnerFreeForExpression(element),
		);
	}
	if (node.type === 'MemberExpression') {
		return (
			isOwnerFreeForExpression(node.object) &&
			(!node.computed || isOwnerFreeForExpression(node.property))
		);
	}
	if (
		node.type === 'ParenthesizedExpression' ||
		node.type === 'ChainExpression' ||
		node.type === 'TSAsExpression' ||
		node.type === 'TSNonNullExpression' ||
		node.type === 'TypeCastExpression'
	) {
		return isOwnerFreeForExpression(node.expression);
	}
	return false;
}

function isOwnerFreeForAttribute(attribute) {
	if (attribute.type === 'JSXSpreadAttribute' || attribute.type === 'SpreadAttribute') return false;
	const name = attributeName(attribute);
	if (
		name === null ||
		name === 'key' ||
		name === 'ref' ||
		name === 'children' ||
		name === 'attach' ||
		name === 'onUpdate' ||
		name.startsWith('on')
	) {
		return false;
	}
	const value = attribute.value;
	if (value === null || value?.type === 'Literal') return true;
	return (
		value?.type === 'JSXExpressionContainer' &&
		value.expression?.type !== 'JSXEmptyExpression' &&
		isOwnerFreeForExpression(value.expression)
	);
}

function ownerFreeForHost(node) {
	if (node.empty != null) return null;
	if (!isOwnerFreeForExpression(node.right) || !isOwnerFreeForExpression(node.key)) return null;
	const body = (node.body?.body ?? []).filter(
		(statement) => statement.type !== 'JSXText' || normalizeJsxText(statement.value ?? '') !== '',
	);
	if (body.length !== 1) return null;
	const host = body[0];
	if (
		(host.type !== 'JSXElement' && host.type !== 'Element') ||
		isComponentElement(host) ||
		jsxName(host) === 'Activity'
	) {
		return null;
	}
	const type = jsxName(host);
	if (type === null || !/^[a-z]/.test(type)) return null;
	if (
		(host.children ?? []).some(
			(child) => child.type !== 'JSXText' || normalizeJsxText(child.value ?? '') !== '',
		)
	) {
		return null;
	}
	const attributes = host.openingElement?.attributes ?? host.attributes ?? [];
	return attributes.every(isOwnerFreeForAttribute) ? host : null;
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
	if (!state.hmr && ownerFreeForHost(node) !== null) {
		const body = compileBlockValue(node.body?.body ?? [], state, `${itemBinding}, ${indexBinding}`);
		return addDynamic(
			context,
			`${state.helpers.for}(${source}, (${itemBinding}, ${indexBinding}) => (${key}), ${body}, null, true, true)`,
		);
	}
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
		if (state.threadFunctionNodes?.has(node)) return null;
		return { fn: node, name: functionName(node), binding: node.id, exportKind: null };
	}
	const variable = singleFunctionDeclarator(node, state);
	if (variable !== null) {
		if (state.threadFunctionNodes?.has(variable.fn)) return null;
		return { ...variable, exportKind: null };
	}
	if (node.type === 'ExportNamedDeclaration' && node.declaration?.type === 'FunctionDeclaration') {
		if (state.threadFunctionNodes?.has(node.declaration)) return null;
		return {
			fn: node.declaration,
			name: functionName(node.declaration),
			binding: node.declaration.id,
			exportKind: 'named',
		};
	}
	if (node.type === 'ExportNamedDeclaration') {
		const exportedVariable = singleFunctionDeclarator(node.declaration, state);
		if (exportedVariable !== null) {
			if (state.threadFunctionNodes?.has(exportedVariable.fn)) return null;
			return { ...exportedVariable, exportKind: 'named' };
		}
	}
	if (
		node.type === 'ExportDefaultDeclaration' &&
		node.declaration?.type === 'FunctionDeclaration'
	) {
		if (state.threadFunctionNodes?.has(node.declaration)) return null;
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
		if (state.threadFunctionNodes?.has(node.declaration)) return null;
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
	const universalRuntime = normalizeUniversalRuntime(options.universalRuntime);
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
		universalRuntime,
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
		validationImportReferences: [],
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
	if (typeof options.authoredSource === 'string') {
		state.validationImportReferences = rendererValidationImportReferences(
			options.authoredSource,
			filename,
			synthetic.origins,
		);
	}
	const specializationBindings = new Set();
	const entryExcluded = new Set((options.runtimeImports ?? []).map(({ local }) => local));
	for (const region of options.deferredRendererRegions ?? []) entryExcluded.add(region.token);
	for (const node of ast.body.slice(0, -1)) {
		const declaration =
			node.type === 'ExportNamedDeclaration' || node.type === 'ExportDefaultDeclaration'
				? node.declaration
				: node;
		if (declaration?.id?.name) {
			entryExcluded.add(declaration.id.name);
			specializationBindings.add(declaration.id.name);
		}
		if (declaration?.type === 'VariableDeclaration') {
			for (const item of declaration.declarations ?? []) {
				addPatternNames(item.id, entryExcluded);
				addPatternNames(item.id, specializationBindings);
			}
		}
	}
	const authoredBindings =
		typeof options.authoredSource === 'string'
			? authoredReferenceBindingMap(options.authoredSource, filename)
			: null;
	const entryCaptureCandidates = collectEntryCaptures(expression, entryExcluded)
		.filter((capture) => {
			if (authoredBindings !== null) {
				const bound = captureHasAuthoredBinding(capture, synthetic.origins, authoredBindings);
				if (bound !== null) return bound === 'local';
			}
			return !UNIVERSAL_REALM_GLOBALS.has(capture.source);
		})
		.map((capture) => ({
			...capture,
			local: capture.source,
		}));
	state.threadExternalCaptures = new Set(entryCaptureCandidates.map((capture) => capture.source));
	validateRuntimeImports(ast, state);
	prepareThreadFunctionReplacements(ast, state);
	const entryCaptures = entryCaptureCandidates.filter((capture) =>
		capture.nodes.some((node) => isThreadNodeActive(state, node)),
	);
	if (renderer.validation !== undefined) {
		validateLoweredRendererSource(ast, state, synthetic.origins, options.authoredSource);
	}
	prepareMainThreadRenderOnlyReplacements(ast, state);
	const regionHelper = allocName(state, `${prefix}Descriptor`);
	const componentName = allocName(state, `${prefix}Body`);
	const emittedComponents = [];
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
			const helper = rewriteSourceNode(node, state);
			recordMapping(state, helper, node);
			if (declaration?.id?.name) recordMapping(state, declaration.id.name, declaration.id);
			emittedComponents.push(helper);
			continue;
		}
		emittedComponents.push(component);
	}
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
	const importedThreadHelpers = threadHelperImports(state);
	const helperImport =
		`import { defineUniversalComponent as ${state.helpers.component}, ` +
		`universalPlan as ${state.helpers.plan}, universalValue as ${state.helpers.value}, ` +
		`universalComponent as ${state.helpers.nestedComponent}, ` +
		`universalProps as ${state.helpers.props}, universalIf as ${state.helpers.if}, ` +
		`universalSwitch as ${state.helpers.switch}, universalFor as ${state.helpers.for}, ` +
		`universalTry as ${state.helpers.try}, universalChildren as ${state.helpers.children}, ` +
		`universalContext as ${state.helpers.context}, universalActivity as ${state.helpers.activity}, ` +
		(state.helpers.firstScreenEvent === undefined
			? ''
			: `firstScreenEvent as ${state.helpers.firstScreenEvent}, `) +
		(importedThreadHelpers === '' ? '' : `${importedThreadHelpers}, `) +
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
	const threadRegistrations = (state.threadFunctionRegistrations ?? []).join('\n');
	const prelude = [
		helperImport,
		profileImport,
		runtimeImport,
		plans,
		threadRegistrations,
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
			...(universalRuntime === undefined ? null : { universalRuntime }),
		}),
		prelude,
		preludeOrigins: mapOrigins(prelude),
		expression: loweredRegionExpression,
		expressionOrigins: mapOrigins(loweredRegionExpression),
		validationImportReferences: Object.freeze(state.validationImportReferences),
	});
}

/**
 * @param {string} source
 * @param {string} filename
 * @param {{ id: string, module: string, target: 'universal', text?: 'host'|'ignore'|'reject', capabilities?: readonly string[], firstScreenEvents?: readonly string[] }} renderer
 * @param {(source: string, metadata: any) => { code: string, map: any }} compileClient
 * @param {Record<string, any>} [options]
 * @param {import('@tsrx/core/types').AST.Program | null} [parsedAst]
 */
export function compileUniversal(
	source,
	filename,
	renderer,
	compileClient,
	options = {},
	parsedAst = null,
) {
	if (
		!renderer ||
		typeof renderer.id !== 'string' ||
		typeof renderer.module !== 'string' ||
		renderer.target !== 'universal'
	) {
		throw new TypeError('Octane universal compiler requires a resolved universal renderer.');
	}
	const universalRuntime = normalizeUniversalRuntime(options.universalRuntime);
	const ast = parsedAst ?? parseModule(source, filename);
	const hmrDialect = options.hmr === true ? 'vite' : options.hmr || false;
	const state = {
		source,
		filename,
		renderer,
		universalRuntime,
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
	prepareThreadFunctionReplacements(ast, state);
	if (renderer.validation !== undefined) {
		const remap = options.__universalValidationRemap;
		if (remap?.origins && remap.authored) {
			const validationAst = parseModule(source, filename);
			remapAuthoredLocations(validationAst, remap.origins, remap.authored);
			validateRendererSource(validationAst, state, remap.origins);
		} else {
			validateRendererSource(ast, state);
		}
	}
	prepareMainThreadRenderOnlyReplacements(ast, state);

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
		emitted.push(rewriteSourceNode(node, state));
	}

	const importedThreadHelpers = threadHelperImports(state);
	const helperImport =
		`import { defineUniversalComponent as ${state.helpers.component}, ` +
		`universalPlan as ${state.helpers.plan}, universalValue as ${state.helpers.value}, ` +
		`universalComponent as ${state.helpers.nestedComponent}, ` +
		`universalProps as ${state.helpers.props}, universalIf as ${state.helpers.if}, ` +
		`universalSwitch as ${state.helpers.switch}, universalFor as ${state.helpers.for}, ` +
		`universalTry as ${state.helpers.try}, universalChildren as ${state.helpers.children}, ` +
		`universalContext as ${state.helpers.context}, universalActivity as ${state.helpers.activity}` +
		(state.helpers.firstScreenEvent === undefined
			? ''
			: `, firstScreenEvent as ${state.helpers.firstScreenEvent}`) +
		(importedThreadHelpers === '' ? '' : `, ${importedThreadHelpers}`) +
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
	const threadRegistrations = (state.threadFunctionRegistrations ?? []).join('\n');
	const lowered = `${helperImport}\n${profileImport}\n${plans}\n${threadRegistrations}\n${emitted.join(
		'\n',
	)}\n${hmrBlock}`;
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
		...(universalRuntime === undefined ? null : { universalRuntime }),
	};
}
