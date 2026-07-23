/**
 * Experimental universal-target lowering.
 *
 * This is intentionally separate from the mature DOM planner. It lowers host
 * JSX to immutable host/range/text/slot plans plus explicit component and
 * control-flow descriptors. The resulting JSX-free AST is handed directly to
 * the client hook/dependency pass with its final runtime imports already routed
 * to the selected renderer module.
 */
import { builders as b, clone_ast_node, parseModule } from '@tsrx/core';
import { normalizeUniversalRuntime } from './universal-runtime.js';

const UNIVERSAL_RUNTIME_IMPORTS = new Set([
	'Activity',
	'createContext',
	'createPortal',
	'lazy',
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

function universalError(filename, node, message) {
	const start = node?.loc?.start;
	const at = start ? ` at ${filename}:${start.line}:${start.column}` : '';
	return new Error(`Octane universal compiler: ${message}${at}`);
}

const AST_SKIP_KEYS = new Set(['end', 'loc', 'metadata', 'parent', 'range', 'start']);
const PLAN_ORIGIN = Symbol('octane.universalPlanOrigin');

function withPlanOrigin(value, origin) {
	if (value && typeof value === 'object' && origin) {
		Object.defineProperty(value, PLAN_ORIGIN, {
			configurable: false,
			enumerable: false,
			value: origin,
			writable: false,
		});
	}
	return value;
}

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

function jsonValueToAst(value, origin) {
	const valueOrigin =
		value && typeof value === 'object' && value[PLAN_ORIGIN] ? value[PLAN_ORIGIN] : origin;
	let node;
	if (value === null) node = b.literal(null, 'null');
	else if (typeof value === 'string') node = b.literal(value, JSON.stringify(value));
	else if (typeof value === 'number' || typeof value === 'boolean') node = b.literal(value);
	else if (Array.isArray(value)) {
		node = b.array(value.map((item) => jsonValueToAst(item, valueOrigin)));
	} else {
		node = b.object(
			Object.entries(value).map(([key, item]) =>
				b.prop('init', b.literal(key, JSON.stringify(key)), jsonValueToAst(item, valueOrigin)),
			),
		);
	}
	return inheritGeneratedOrigin(node, valueOrigin);
}

function generatedIdentifier(name, origin) {
	return inheritGeneratedOrigin(b.id(name), origin);
}

function generatedCall(callee, args, origin) {
	return inheritGeneratedOrigin(b.call(callee, ...args), origin);
}

function generatedArrow(params, body, origin) {
	return inheritGeneratedOrigin(b.arrow(params, body), origin);
}

function generatedConst(name, init, origin, kind = 'const') {
	const declaration =
		kind === 'let' ? b.let(name, init) : kind === 'var' ? b.var(name, init) : b.const(name, init);
	return inheritGeneratedOrigin(declaration, origin);
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

function keepThreadImportBinding(references, source, name) {
	const counts = references.get(source)?.get(name);
	return counts === undefined || counts.total === 0 || counts.active > 0;
}

function isStaticThreadImportSource(source) {
	return source?.type === 'Literal' && typeof source.value === 'string';
}

function prepareMainThreadRenderOnlyAstReplacements(ast, state) {
	if (!isMainThreadRenderOnly(state)) return;
	state.astNodeReplacements ??= new WeakMap();
	const { nodeScopes, resolveBinding, rootScope } = createLexicalAnalysis(ast);
	const seen = new WeakSet();
	const visit = (node) => {
		if (!node || typeof node !== 'object' || seen.has(node)) return;
		seen.add(node);
		if (Array.isArray(node)) {
			for (const child of node) visit(child);
			return;
		}
		if (
			node.type === 'CallExpression' &&
			node.callee?.type === 'Identifier' &&
			resolveBinding(nodeScopes.get(node.callee) ?? rootScope, node.callee.name)?.importSource
				?.value === 'octane' &&
			MAIN_THREAD_BACKGROUND_EFFECTS.has(state.runtimeImports.get(node.callee.name))
		) {
			for (const argument of node.arguments ?? []) {
				if (argument && typeof argument === 'object') {
					state.astNodeReplacements.set(
						argument,
						inheritGeneratedOrigin(b.id('undefined'), argument),
					);
				}
			}
			return;
		}
		for (const [key, child] of Object.entries(node)) {
			if (!AST_SKIP_KEYS.has(key)) visit(child);
		}
	};
	visit(ast);
}

function threadFunctionExpression(site) {
	const fn = clone_ast_node(site.fn);
	if (fn.type === 'FunctionDeclaration') fn.type = 'FunctionExpression';
	fn.body = { ...fn.body, body: (fn.body.body ?? []).slice(1) };
	return fn;
}

function prepareThreadFunctionAstReplacements(ast, state) {
	if (!rendererHasCapability(state, THREAD_FUNCTION_CAPABILITY)) return;
	const parents = new WeakMap();
	const directives = [];
	const seen = new WeakSet();
	const visit = (node, parent = null) => {
		if (!node || typeof node !== 'object' || seen.has(node)) return;
		seen.add(node);
		if (Array.isArray(node)) {
			for (const child of node) visit(child, parent);
			return;
		}
		if (parent !== null) parents.set(node, parent);
		if (
			node.type === 'ExpressionStatement' &&
			THREAD_DIRECTIVES.has(node.directive ?? node.expression?.value)
		) {
			directives.push(node);
		}
		forEachRuntimeAstChild(node, (child) => visit(child, node));
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
		sites.push({ fn, directive, kind, declarationContainer });
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

	state.astNodeReplacements ??= new WeakMap();
	state.threadFunctionNodes = new WeakSet(sites.map((site) => site.fn));
	state.threadFunctionRegistrationsAst = [];
	state.threadFunctionDisposals = [];
	state.threadErasedRanges = sites
		.filter((site) => site.kind !== state.universalRuntime.thread)
		.map((site) => ({ start: site.fn.loc?.start, end: site.fn.loc?.end }))
		.sort((left, right) => compareSourcePosition(left.start, right.start));
	if (sites.some((site) => site.kind === state.universalRuntime.thread)) {
		state.helpers.registerThreadFunction = allocName(
			state,
			`${state.planPrefix ?? '__octane'}RegisterThreadFunction`,
		);
		if (state.hmr) {
			state.helpers.unregisterThreadFunction = allocName(
				state,
				`${state.planPrefix ?? '__octane'}UnregisterThreadFunction`,
			);
		}
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
		const loc = site.fn.loc?.start;
		const id = `tf_${threadHash(
			`${state.profileFilename || state.filename || '<anon>'}\0${site.kind}\0${loc?.line ?? 0}:${
				loc?.column ?? 0
			}`,
		)}`;
		const metadata = {
			file: (state.profileFilename || state.filename || '<anon>').split(/[\\/]/).pop(),
			line: loc?.line ?? 0,
			column: loc?.column ?? 0,
		};
		const captureProvider = generatedArrow(
			[],
			inheritGeneratedOrigin(b.array(captures.map((capture) => b.id(capture.name))), site.fn),
			site.fn,
		);
		const helperArguments = [
			b.literal(site.kind),
			b.literal(id),
			captureProvider,
			jsonValueToAst(metadata, site.fn),
		];
		Object.assign(site, { captures, id, metadata, helperArguments });
	}

	const declarationAttachments = new Map();
	for (const site of sites) {
		const { captures, id, helperArguments } = site;
		if (site.fn.type === 'FunctionDeclaration') {
			let name = site.fn.id?.name;
			if (!name) name = allocName(state, '__octaneThreadDefault');
			const attachment = inheritGeneratedOrigin(
				b.stmt(
					generatedCall(
						state.helpers.attachThreadFunction,
						[generatedIdentifier(name, site.fn), ...helperArguments],
						site.fn,
					),
				),
				site.fn,
			);
			const wrapper = inheritGeneratedOrigin(
				{
					...site.fn,
					id: generatedIdentifier(name, site.fn),
					params: [b.rest(generatedIdentifier(wrapperArguments, site.fn))],
					body: b.block([
						attachment,
						b.return(
							generatedCall(
								state.helpers.invokeThreadFunction,
								[
									generatedIdentifier(name, site.fn),
									b.this,
									generatedIdentifier(wrapperArguments, site.fn),
								],
								site.fn,
							),
						),
					]),
				},
				site.fn,
			);
			state.astNodeReplacements.set(site.fn, wrapper);
			let attachments = declarationAttachments.get(site.declarationContainer);
			if (attachments === undefined) {
				attachments = [];
				declarationAttachments.set(site.declarationContainer, attachments);
			}
			attachments.push(attachment);
		} else {
			state.astNodeReplacements.set(
				site.fn,
				generatedCall(state.helpers.bindThreadFunction, helperArguments, site.fn),
			);
		}
		if (site.kind === state.universalRuntime.thread) {
			const registrationBody = [];
			if (captures.length > 0) {
				registrationBody.push(
					inheritGeneratedOrigin(
						b.let(
							b.array_pattern(captures.map((capture) => b.id(capture.name))),
							b.id(captureParameter),
						),
						site.fn,
					),
				);
			}
			const stripped = inheritGeneratedOrigin(threadFunctionExpression(site), site.fn);
			registrationBody.push(
				inheritGeneratedOrigin(
					b.return(
						b.call(b.member(stripped, 'apply'), b.id(receiverParameter), b.id(argumentParameter)),
					),
					site.fn,
				),
			);
			const runtimeFunction = inheritGeneratedOrigin(
				b.function(
					null,
					[b.id(captureParameter), b.id(receiverParameter), b.id(argumentParameter)],
					b.block(registrationBody),
				),
				site.fn,
			);
			state.threadFunctionRegistrationsAst.push(
				inheritGeneratedOrigin(
					b.stmt(
						generatedCall(
							state.helpers.registerThreadFunction,
							[
								b.literal(site.kind),
								b.literal(id),
								runtimeFunction,
								jsonValueToAst(site.metadata, site.fn),
							],
							site.fn,
						),
					),
					site.fn,
				),
			);
			if (state.hmr) state.threadFunctionDisposals.push({ kind: site.kind, id });
		}
	}
	state.astNodePrefixes ??= new WeakMap();
	for (const [container, attachments] of declarationAttachments) {
		if (container?.type === 'Program') {
			state.threadFunctionRegistrationsAst.push(...attachments);
			continue;
		}
		const firstStatement = (container?.body ?? []).find(
			(statement) => statement?.type !== 'ExpressionStatement' || statement.directive === undefined,
		);
		if (firstStatement === undefined) continue;
		state.astNodePrefixes.set(firstStatement, [
			...(state.astNodePrefixes.get(firstStatement) ?? []),
			...attachments,
		]);
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
			state.astNodeReplacements.set(
				node,
				keptSpecifiers.length === 0 ? null : { ...node, specifiers: keptSpecifiers },
			);
			if (keptSpecifiers.length === 0 && node.source?.loc?.start) {
				state.threadElidedImportLocations.push(node.source.loc.start);
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
				state.astNodeReplacements.set(node, null);
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
			state.astNodeReplacements.set(
				node,
				keptDeclarations.length === 0 ? null : { ...node, declarations: keptDeclarations },
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

function validateRendererSource(ast, state) {
	const validation = state.renderer.validation;
	if (validation === undefined) return;
	const isAuthored = () => true;
	const needsLexicalAnalysis =
		(validation.forbiddenImports?.length ?? 0) > 0 ||
		(validation.forbiddenGlobals?.length ?? 0) > 0;
	const lexicalAnalysis = needsLexicalAnalysis ? createLexicalAnalysis(ast) : null;
	validateForbiddenImports(ast, state, validation, isAuthored, lexicalAnalysis);
	validateForbiddenGlobals(ast, state, validation, isAuthored, lexicalAnalysis);
	validateHostTemplates(ast, state, validation, isAuthored);
}

function validateRendererSourceRanges(ast, state, ranges, exclusions = []) {
	const validation = state.renderer.validation;
	if (validation === undefined) return;
	const selected = ranges.filter(
		(range) =>
			typeof range?.start === 'number' &&
			typeof range?.end === 'number' &&
			range.end >= range.start,
	);
	const staticModuleSources = new WeakSet();
	for (const statement of ast.body ?? []) {
		const source =
			statement.type === 'TSImportEqualsDeclaration'
				? statement.moduleReference?.expression
				: statement.source;
		if (source && typeof source === 'object') staticModuleSources.add(source);
	}
	const isSelected = (node) =>
		typeof node?.start === 'number' &&
		typeof node?.end === 'number' &&
		selected.some((range) => range.start <= node.start && node.end <= range.end) &&
		!exclusions.some(
			(range) =>
				typeof range?.start === 'number' &&
				typeof range?.end === 'number' &&
				range.start <= node.start &&
				node.end <= range.end,
		);
	const isAuthored = (node) => isSelected(node) && !staticModuleSources.has(node);
	const needsLexicalAnalysis =
		(validation.forbiddenImports?.length ?? 0) > 0 ||
		(validation.forbiddenGlobals?.length ?? 0) > 0;
	const lexicalAnalysis = needsLexicalAnalysis ? createLexicalAnalysis(ast) : null;
	if (lexicalAnalysis !== null) {
		const referencedStaticSources = referencedImportSources(
			ast,
			lexicalAnalysis,
			isAuthored,
			(node) => isThreadNodeActive(state, node),
		);
		state.validationImportReferences = importSourceRanges(referencedStaticSources);
		validateForbiddenImports(
			ast,
			state,
			validation,
			isAuthored,
			lexicalAnalysis,
			referencedStaticSources,
		);
		validateForbiddenGlobals(ast, state, validation, isAuthored, lexicalAnalysis);
	}
	validateHostTemplates(ast, state, validation, isAuthored);
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

function rendererHasCapability(state, capability) {
	return Array.isArray(state.renderer.capabilities)
		? state.renderer.capabilities.includes(capability)
		: false;
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

function allocPlan(state, root, origin = null) {
	const name = allocName(
		state,
		state.planPrefix
			? `${state.planPrefix}Plan${state.plans.length}`
			: `__octaneUniversalPlan${state.plans.length}`,
	);
	state.plans.push({ name, root, origin });
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

function jsxNameExpressionAst(node, state) {
	const name = node?.openingElement?.name ?? node?.name;
	if (name?.type === 'JSXIdentifier' || name?.type === 'Identifier') {
		return generatedIdentifier(name.name, name);
	}
	if (name?.type === 'JSXMemberExpression' || name?.type === 'MemberExpression') {
		return inheritGeneratedOrigin(
			b.member(
				jsxNameExpressionAst({ name: name.object }, state),
				name.property?.name ?? name.property?.value,
			),
			name,
		);
	}
	if (name?.type === 'JSXExpressionContainer') {
		assertNoResidualTemplate(name.expression, state, 'a dynamic component name');
		return rewriteSourceAst(name.expression, state);
	}
	throw universalError(state.filename, node, 'unsupported JSX tag name.');
}

function contextProviderExpressionAst(node, state) {
	const name = node?.openingElement?.name ?? node?.name;
	if (
		(name?.type === 'JSXMemberExpression' || name?.type === 'MemberExpression') &&
		(name.property?.name ?? name.property?.value) === 'Provider'
	) {
		return jsxNameExpressionAst({ name: name.object }, state);
	}
	return null;
}

function compileRenderableExpressionAst(node, state) {
	const context = { values: [] };
	const nodes = compileChildAst(node, context, state);
	const root =
		nodes.length === 1 ? nodes[0] : withPlanOrigin({ kind: 'range', children: nodes }, node);
	const plan = allocPlan(state, root, node);
	return generatedCall(
		state.helpers.value,
		[generatedIdentifier(plan, node), inheritGeneratedOrigin(b.array(context.values), node)],
		node,
	);
}

function rewriteSourceAst(node, state) {
	if (!node || typeof node !== 'object') return node;
	const visit = (value) => {
		if (!value || typeof value !== 'object') return value;
		if (Array.isArray(value)) {
			let output = null;
			for (let index = 0; index < value.length; index++) {
				const prefixes = state.astNodePrefixes?.get(value[index]) ?? [];
				if (prefixes.length > 0 && output === null) output = value.slice(0, index);
				if (output !== null) {
					for (const prefix of prefixes) {
						const mappedPrefix = visit(prefix);
						if (mappedPrefix !== null) output.push(mappedPrefix);
					}
				}
				const mapped = visit(value[index]);
				if (output === null && mapped !== value[index]) output = value.slice(0, index);
				if (output !== null && mapped !== null) output.push(mapped);
			}
			return output ?? value;
		}
		const replacement = state.astNodeReplacements?.get(value);
		if (replacement !== undefined) return replacement;
		if (value !== node && isTemplateNode(value)) {
			return compileRenderableExpressionAst(value, state);
		}
		let output = null;
		for (const [key, child] of Object.entries(value)) {
			if (AST_SKIP_KEYS.has(key)) continue;
			const mapped = visit(child);
			if (mapped !== child) {
				if (output === null) output = { ...value };
				output[key] = mapped;
			}
		}
		return output ?? value;
	};
	return visit(node);
}

function dynamicExpressionAst(node, state) {
	return rewriteSourceAst(node, state);
}

function firstScreenEventValueAst(expression, state) {
	const value = unwrapFirstScreenExpression(expression);
	if (value?.type === 'ArrowFunctionExpression' || value?.type === 'FunctionExpression') {
		return generatedIdentifier(firstScreenEventHelper(state), expression);
	}
	if (
		(value?.type === 'Literal' && value.value === null) ||
		(value?.type === 'Identifier' && value.name === 'undefined') ||
		(value?.type === 'UnaryExpression' && value.operator === 'void')
	) {
		return dynamicExpressionAst(expression, state);
	}
	if (value?.type === 'ConditionalExpression') {
		return inheritGeneratedOrigin(
			b.conditional(
				dynamicExpressionAst(value.test, state),
				firstScreenEventValueAst(value.consequent, state),
				firstScreenEventValueAst(value.alternate, state),
			),
			expression,
		);
	}
	return inheritGeneratedOrigin(
		b.conditional(
			b.binary('==', dynamicExpressionAst(expression, state), b.literal(null, 'null')),
			b.id('undefined'),
			b.id(firstScreenEventHelper(state)),
		),
		expression,
	);
}

function mainThreadHostValueAst(name, expression, state) {
	if (!isMainThreadRenderOnly(state)) return dynamicExpressionAst(expression, state);
	if (name === 'ref') return inheritGeneratedOrigin(b.id('undefined'), expression);
	return isFirstScreenEvent(name, state)
		? firstScreenEventValueAst(expression, state)
		: dynamicExpressionAst(expression, state);
}

function compilePropsAst(
	attributes,
	childrenExpression,
	state,
	origin,
	canonicalizeHostClass = false,
	host = false,
) {
	const entries = [];
	for (const attribute of attributes) {
		if (attribute.type === 'JSXSpreadAttribute' || attribute.type === 'SpreadAttribute') {
			entries.push(
				inheritGeneratedOrigin(
					b.array([
						b.literal('spread', '"spread"'),
						dynamicExpressionAst(attribute.argument, state),
					]),
					attribute,
				),
			);
			continue;
		}
		const rawName = host ? hostAttributeName(attribute, state) : attributeName(attribute);
		const name = canonicalHostAttributeName(rawName, canonicalizeHostClass);
		if (name === null) {
			throw universalError(state.filename, attribute, 'namespaced JSX attributes are unsupported.');
		}
		const value = attribute.value;
		let expression;
		if (value == null) expression = b.literal(true);
		else if (value.type === 'Literal') expression = b.literal(value.value);
		else if (
			value.type === 'JSXExpressionContainer' &&
			value.expression &&
			value.expression.type !== 'JSXEmptyExpression'
		) {
			expression = mainThreadHostValueAst(name, value.expression, state);
		} else if (value.type === 'JSXExpressionContainer') {
			continue;
		} else {
			throw universalError(
				state.filename,
				attribute,
				`unsupported value for JSX attribute ${name}.`,
			);
		}
		entries.push(
			inheritGeneratedOrigin(
				b.array([b.literal('set', '"set"'), b.literal(name, JSON.stringify(name)), expression]),
				attribute,
			),
		);
	}
	const args = [inheritGeneratedOrigin(b.array(entries), origin)];
	if (childrenExpression === null) {
		if (canonicalizeHostClass) args.push(inheritGeneratedOrigin(b.id('undefined'), origin));
	} else {
		args.push(childrenExpression);
	}
	if (canonicalizeHostClass) args.push(inheritGeneratedOrigin(b.literal(true), origin));
	return generatedCall(state.helpers.props, args, origin);
}

function compilePlainPropsObjectAst(attributes, state, origin) {
	const entries = [];
	for (const attribute of attributes) {
		if (attribute.type === 'JSXSpreadAttribute' || attribute.type === 'SpreadAttribute') {
			entries.push(
				inheritGeneratedOrigin(
					b.spread(dynamicExpressionAst(attribute.argument, state)),
					attribute,
				),
			);
			continue;
		}
		const name = attributeName(attribute);
		if (name === null) continue;
		const value = attribute.value;
		let expression;
		if (value == null) expression = b.literal(true);
		else if (value.type === 'Literal') expression = b.literal(value.value);
		else if (
			value.type === 'JSXExpressionContainer' &&
			value.expression &&
			value.expression.type !== 'JSXEmptyExpression'
		) {
			expression = dynamicExpressionAst(value.expression, state);
		} else {
			continue;
		}
		entries.push(
			inheritGeneratedOrigin(
				b.prop('init', b.literal(name, JSON.stringify(name)), expression),
				attribute,
			),
		);
	}
	return inheritGeneratedOrigin(b.object(entries), origin);
}

function compileAttributeAst(attribute, context, state, canonicalizeHostClass) {
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
		context.values.push(mainThreadHostValueAst(name, value.expression, state));
		return { name, slot };
	}
	throw universalError(state.filename, attribute, `unsupported value for host attribute ${name}.`);
}

function addDynamicAst(context, expression) {
	const slot = context.values.length;
	context.values.push(expression);
	return withPlanOrigin({ kind: 'slot', slot }, expression);
}

function compileHostElementAst(node, context, state) {
	const type = jsxName(node);
	if (type === 'Activity') return compileActivityElementAst(node, context, state);
	if (isComponentElement(node)) return compileComponentElementAst(node, context, state);
	if (type === null) {
		throw universalError(
			state.filename,
			node,
			'member-expression and namespaced host tags are unsupported.',
		);
	}
	if (!/^[a-z]/.test(type)) return compileComponentElementAst(node, context, state);
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
		context.values.push(
			compilePropsAst(attributes, null, state, node, canonicalizeHostClass, true),
		);
	} else {
		for (const attribute of attributes) {
			const compiled = compileAttributeAst(attribute, context, state, canonicalizeHostClass);
			if (compiled === null) continue;
			if ('slot' in compiled) bindings.push([compiled.name, compiled.slot]);
			else props[compiled.name] = compiled.staticValue;
		}
	}
	const children = compileChildrenAst(node.children ?? [], context, state);
	return withPlanOrigin(
		{
			kind: 'host',
			type,
			...(Object.keys(props).length === 0 ? null : { props }),
			...(bindings.length === 0 ? null : { bindings }),
			...(propsSlot === null ? null : { propsSlot }),
			...(children.length === 0 ? null : { children }),
		},
		node,
	);
}

function compileActivityElementAst(node, context, state) {
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
			mode = inheritGeneratedOrigin(b.literal(value.value), value);
		} else if (
			value?.type === 'JSXExpressionContainer' &&
			value.expression &&
			value.expression.type !== 'JSXEmptyExpression'
		) {
			mode = dynamicExpressionAst(value.expression, state);
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
	const body = compileBlockValueAst(node.children ?? [], state, [], node);
	return addDynamicAst(context, generatedCall(state.helpers.activity, [mode, body], node));
}

function compileComponentElementAst(node, context, state) {
	const component = jsxNameExpressionAst(node, state);
	const providerContext = contextProviderExpressionAst(node, state);
	const childNodes = node.children ?? [];
	let childrenExpression = null;
	if (
		childNodes.some((child) => child.type !== 'JSXText' || normalizeJsxText(child.value) !== '')
	) {
		const body = compileBlockValueAst(childNodes, state, [], node);
		childrenExpression = generatedCall(
			state.helpers.children,
			[b.literal(state.renderer.id), body],
			node,
		);
	}
	const attributes = node.openingElement?.attributes ?? node.attributes ?? [];
	if (providerContext !== null) {
		const propsObject = compilePlainPropsObjectAst(attributes, state, node);
		const propsName = generatedIdentifier('__octaneContextProps', node);
		const selectedChildren =
			childrenExpression ?? inheritGeneratedOrigin(b.member(propsName, 'children'), node);
		const callback = generatedArrow(
			[propsName],
			generatedCall(
				state.helpers.context,
				[
					providerContext,
					inheritGeneratedOrigin(
						b.member(generatedIdentifier(propsName.name, node), 'value'),
						node,
					),
					selectedChildren,
				],
				node,
			),
			node,
		);
		return addDynamicAst(context, generatedCall(callback, [propsObject], node));
	}
	const props = compilePropsAst(attributes, childrenExpression, state, node);
	return addDynamicAst(
		context,
		generatedCall(
			state.helpers.nestedComponent,
			[b.literal(state.renderer.id), component, props],
			node,
		),
	);
}

function rewriteSetupStatementsAst(statements, state) {
	const hoisted = [];
	const body = [];
	for (const statement of statements ?? []) {
		const component = nestedFunctionComponentAst(statement, state);
		const nodes = component === null ? rewriteSetupStatementAst(statement, state) : component;
		const prefixed = [
			...(state.astNodePrefixes?.get(statement) ?? []),
			...(Array.isArray(nodes) ? nodes : nodes === null ? [] : [nodes]),
		];
		if (component === null) body.push(...prefixed);
		else hoisted.push(...prefixed);
	}
	return [...hoisted, ...body];
}

function compileBlockValueAst(statements, state, params = [], origin = null) {
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
			templates.push(...compileChildAst(statement, context, state));
		} else {
			setup.push(statement);
		}
	}
	const root =
		templates.length === 1
			? templates[0]
			: withPlanOrigin({ kind: 'range', children: templates }, origin ?? statements?.[0]);
	const plan = allocPlan(state, root, origin ?? statements?.[0]);
	const value = generatedCall(
		state.helpers.value,
		[
			generatedIdentifier(plan, origin ?? statements?.[0]),
			inheritGeneratedOrigin(b.array(context.values), origin ?? statements?.[0]),
		],
		origin ?? statements?.[0],
	);
	const block = inheritGeneratedOrigin(
		b.block([...rewriteSetupStatementsAst(setup, state), b.return(value)]),
		origin ?? statements?.[0],
	);
	return generatedArrow(params, block, origin ?? statements?.[0]);
}

function nestedFunctionComponentAst(statement, state) {
	if (statement?.type !== 'FunctionDeclaration' || state.threadFunctionNodes?.has(statement)) {
		return null;
	}
	const name = functionName(statement);
	if (
		statement.body?.type !== 'JSXCodeBlock' &&
		!hasOwnTemplateReturn(statement) &&
		!state.componentNames.has(name)
	) {
		return null;
	}
	return emitComponentAst({ fn: statement, name, exportKind: null }, state);
}

function rewriteSetupStatementAst(statement, state) {
	const variable = singleFunctionDeclarator(statement, state);
	if (
		variable !== null &&
		(variable.fn.body?.type === 'JSXCodeBlock' ||
			hasOwnTemplateReturn(variable.fn) ||
			state.componentNames.has(variable.name))
	) {
		return emitComponentAst({ ...variable, exportKind: null }, state);
	}
	const rewritten = rewriteSourceAst(statement, state);
	return rewritten === null ? [] : [rewritten];
}

function compileForAst(node, context, state) {
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
	const itemBinding = declaration.id;
	const indexBinding =
		node.index ?? generatedIdentifier(allocName(state, '__octaneUniversalIndex'), node);
	assertNoResidualTemplate(node.right, state, '@for source');
	assertNoResidualTemplate(node.key, state, '@for key');
	const args = [
		rewriteSourceAst(node.right, state),
		generatedArrow([itemBinding, indexBinding], rewriteSourceAst(node.key, state), node.key),
		compileBlockValueAst(
			node.body?.body ?? [],
			state,
			[itemBinding, indexBinding],
			node.body ?? node,
		),
	];
	if (!state.hmr && ownerFreeForHost(node) !== null) {
		args.push(b.literal(null, 'null'), b.literal(true), b.literal(true));
	} else if (node.empty) {
		args.push(compileBlockValueAst(node.empty?.body ?? [], state, [], node.empty));
	}
	return addDynamicAst(context, generatedCall(state.helpers.for, args, node));
}

function compileIfAst(node, context, state) {
	assertNoResidualTemplate(node.test, state, '@if condition');
	const consequent = compileBlockValueAst(
		node.consequent?.body ?? [node.consequent],
		state,
		[],
		node.consequent ?? node,
	);
	let alternate = null;
	if (node.alternate) {
		alternate =
			node.alternate.type === 'JSXIfExpression'
				? generatedArrow([], compileIfValueAst(node.alternate, state), node.alternate)
				: compileBlockValueAst(node.alternate?.body ?? [node.alternate], state, [], node.alternate);
	}
	const args = [rewriteSourceAst(node.test, state), consequent];
	if (alternate !== null) args.push(alternate);
	return addDynamicAst(context, generatedCall(state.helpers.if, args, node));
}

function compileIfValueAst(node, state) {
	const context = { values: [] };
	const slot = compileIfAst(node, context, state);
	return context.values[slot.slot];
}

function compileSwitchAst(node, context, state) {
	assertNoResidualTemplate(node.discriminant, state, '@switch discriminant');
	const cases = [];
	let fallback = null;
	for (const item of node.cases ?? []) {
		const thunk = compileBlockValueAst(item.consequent ?? [], state, [], item);
		if (item.test == null) fallback = thunk;
		else {
			assertNoResidualTemplate(item.test, state, '@case expression');
			cases.push(
				inheritGeneratedOrigin(b.array([rewriteSourceAst(item.test, state), thunk]), item),
			);
		}
	}
	const args = [
		rewriteSourceAst(node.discriminant, state),
		inheritGeneratedOrigin(b.array(cases), node),
	];
	if (fallback !== null) args.push(fallback);
	return addDynamicAst(context, generatedCall(state.helpers.switch, args, node));
}

function compileTryAst(node, context, state) {
	const body = compileBlockValueAst(node.block?.body ?? [], state, [], node.block ?? node);
	const pending = node.pending
		? compileBlockValueAst(node.pending.body ?? [], state, [], node.pending)
		: inheritGeneratedOrigin(b.literal(null, 'null'), node);
	const caught = node.handler
		? compileBlockValueAst(
				node.handler.body?.body ?? [],
				state,
				[node.handler.param, node.handler.resetParam].filter(Boolean),
				node.handler,
			)
		: inheritGeneratedOrigin(b.literal(null, 'null'), node);
	return addDynamicAst(context, generatedCall(state.helpers.try, [body, pending, caught], node));
}

function compileChildAst(node, context, state) {
	if (node == null) return [];
	if (node.type === 'JSXText') {
		const value = normalizeJsxText(node.value);
		if (value === '' || state.renderer.text === 'ignore') return [];
		if (state.renderer.text !== 'host') {
			throw universalError(
				state.filename,
				node,
				`renderer ${JSON.stringify(state.renderer.id)} rejects authored text children.`,
			);
		}
		return [withPlanOrigin({ kind: 'text', value }, node)];
	}
	if (node.type === 'JSXExpressionContainer') {
		if (!node.expression || node.expression.type === 'JSXEmptyExpression') return [];
		return [addDynamicAst(context, dynamicExpressionAst(node.expression, state))];
	}
	if (node.type === 'JSXElement' || node.type === 'Element') {
		return [compileHostElementAst(node, context, state)];
	}
	if (node.type === 'JSXFragment' || node.type === 'Fragment') {
		return [
			withPlanOrigin(
				{ kind: 'range', children: compileChildrenAst(node.children ?? [], context, state) },
				node,
			),
		];
	}
	if (node.type === 'JSXForExpression') return [compileForAst(node, context, state)];
	if (node.type === 'JSXIfExpression') return [compileIfAst(node, context, state)];
	if (node.type === 'JSXSwitchExpression') return [compileSwitchAst(node, context, state)];
	if (node.type === 'JSXTryExpression') return [compileTryAst(node, context, state)];
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

function compileChildrenAst(children, context, state) {
	const output = [];
	for (const child of children) output.push(...compileChildAst(child, context, state));
	return output;
}

function extractEntryParallelUsesAst(expression, state) {
	const useAliases = new Set(
		[...state.runtimeImports].filter(([, imported]) => imported === 'use').map(([local]) => local),
	);
	if (useAliases.size === 0) return [];
	const calls = [];
	const seen = new WeakSet();
	const visit = (node) => {
		if (!node || typeof node !== 'object' || seen.has(node)) return;
		seen.add(node);
		if (Array.isArray(node)) {
			for (const child of node) visit(child);
			return;
		}
		if (
			node !== expression &&
			(node.type === 'FunctionDeclaration' ||
				node.type === 'FunctionExpression' ||
				node.type === 'ArrowFunctionExpression')
		) {
			return;
		}
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
			if (!AST_SKIP_KEYS.has(key)) visit(child);
		}
	};
	visit(expression);
	calls.sort((left, right) => left.start - right.start);
	state.astNodeReplacements ??= new WeakMap();
	return calls.map((call, index) => {
		const name = allocName(state, `${state.planPrefix}EntryUse${index}`);
		const value = dynamicExpressionAst(call, state);
		state.astNodeReplacements.set(call, generatedIdentifier(name, call));
		return generatedConst(name, value, call);
	});
}

function emitComponentAst(shape, state) {
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
	const setup = rewriteSetupStatementsAst(render.setup, state);
	const body = [...setup];
	if (render.render !== null) {
		body.push(
			inheritGeneratedOrigin(
				b.return(compileRenderableExpressionAst(render.render, state)),
				render.render,
			),
		);
	} else if (render.expression !== undefined) {
		body.push(
			inheritGeneratedOrigin(
				b.return(rewriteSourceAst(render.expression, state)),
				render.expression,
			),
		);
	}
	const componentFunction = inheritGeneratedOrigin(
		Object.assign(
			b.function(
				generatedIdentifier(name, fn),
				(fn.params ?? []).map((param) => rewriteSourceAst(param, state)),
				b.block(body),
				false,
				fn.typeParameters,
			),
			fn.returnType === undefined ? null : { returnType: fn.returnType },
		),
		fn,
	);
	let wrapped = generatedCall(
		state.helpers.component,
		[
			b.literal(state.renderer.id),
			componentFunction,
			jsonValueToAst({ module: state.renderer.module }, fn),
		],
		fn,
	);
	if (shape.wrapper) {
		wrapped = generatedCall(
			rewriteSourceAst(shape.wrapper.callee, state),
			[wrapped, ...shape.wrapper.arguments.map((argument) => rewriteSourceAst(argument, state))],
			fn,
		);
	}
	if (state.hmr && exportKind !== null) {
		wrapped = generatedCall(state.helpers.hmr, [b.literal(state.renderer.id), wrapped], fn);
		state.hmrComponents.push({ name, exportKind, origin: fn });
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
		wrapped = generatedCall(state.helpers.profile, [wrapped, jsonValueToAst(metadata, fn)], fn);
	}
	const declaration = generatedConst(
		name,
		wrapped,
		fn,
		state.hmrDialect === 'webpack' && exportKind !== null ? 'let' : 'const',
	);
	if (exportKind === 'named') {
		return [inheritGeneratedOrigin(b.export(declaration), fn)];
	}
	if (exportKind === 'default') {
		return [
			declaration,
			inheritGeneratedOrigin(b.export_default(generatedIdentifier(name, fn)), fn),
		];
	}
	return [declaration];
}

export const UNIVERSAL_COMPILER_RUNTIME_IMPORTS = new Set([
	...UNIVERSAL_RUNTIME_IMPORTS,
	'__useReducerWithGetter',
	'__useStateWithGetter',
	'hookSlots',
	'useBatch',
	'warmChild',
	'warmMemo',
	'withSlot',
]);

function threadHelperImportPairs(state) {
	return [
		['registerThreadFunction', state.helpers.registerThreadFunction],
		['unregisterThreadFunction', state.helpers.unregisterThreadFunction],
		['bindThreadFunction', state.helpers.bindThreadFunction],
		['attachThreadFunction', state.helpers.attachThreadFunction],
		['invokeThreadFunction', state.helpers.invokeThreadFunction],
	].filter(([, local]) => local !== undefined);
}

function universalHelperImportAst(state, extraPairs = [], origin = null) {
	const pairs = [
		['defineUniversalComponent', state.helpers.component],
		['universalPlan', state.helpers.plan],
		['universalValue', state.helpers.value],
		['universalComponent', state.helpers.nestedComponent],
		['universalProps', state.helpers.props],
		['universalIf', state.helpers.if],
		['universalSwitch', state.helpers.switch],
		['universalFor', state.helpers.for],
		['universalTry', state.helpers.try],
		['universalChildren', state.helpers.children],
		['universalContext', state.helpers.context],
		['universalActivity', state.helpers.activity],
		...(state.helpers.firstScreenEvent === undefined
			? []
			: [['firstScreenEvent', state.helpers.firstScreenEvent]]),
		...threadHelperImportPairs(state),
		...(state.hmr
			? [
					['hmrUniversalComponent', state.helpers.hmr],
					['UNIVERSAL_HMR', state.helpers.hmrSymbol],
				]
			: []),
		...extraPairs,
	];
	return inheritGeneratedOrigin(b.imports(pairs, state.renderer.module), origin);
}

function universalProfileImportAst(state, origin = null) {
	return state.profile
		? inheritGeneratedOrigin(
				b.imports([['__profileComponent', state.helpers.profile]], 'octane/profiling'),
				origin,
			)
		: null;
}

function universalPlanDeclarationsAst(state, origin = null) {
	return state.plans.map((plan) => {
		const planOrigin = plan.origin ?? origin;
		return generatedConst(
			plan.name,
			generatedCall(
				state.helpers.plan,
				[b.literal(state.renderer.id), jsonValueToAst(plan.root, planOrigin)],
				planOrigin,
			),
			planOrigin,
		);
	});
}

function importMetaExpression(origin) {
	return inheritGeneratedOrigin(
		{
			type: 'MetaProperty',
			meta: b.id('import'),
			property: b.id('meta'),
			metadata: { path: [] },
		},
		origin,
	);
}

function importMetaMember(name, origin) {
	return inheritGeneratedOrigin(b.member(importMetaExpression(origin), name), origin);
}

function memberPath(root, names, origin) {
	let expression = root;
	for (const name of names) expression = b.member(expression, name);
	return inheritGeneratedOrigin(expression, origin);
}

function hmrComponentStore(root, origin) {
	return memberPath(root, ['data', '__octaneUniversalComponents'], origin);
}

function hmrDisposalStatements(state, origin) {
	return (state.threadFunctionDisposals ?? []).map((site) =>
		inheritGeneratedOrigin(
			b.stmt(
				generatedCall(
					state.helpers.unregisterThreadFunction,
					[b.literal(site.kind), b.literal(site.id)],
					origin,
				),
			),
			origin,
		),
	);
}

function hmrHandoffStatements(state, hot, origin) {
	const output = [];
	for (const component of state.hmrComponents) {
		const componentOrigin = component.origin ?? origin;
		const existing = b.member(hmrComponentStore(hot, componentOrigin), component.name);
		const test = b.logical('&&', hmrComponentStore(hot, componentOrigin), existing);
		const update = b.stmt(
			b.call(
				b.member(b.member(existing, b.id(state.helpers.hmrSymbol), true), 'update'),
				b.id(component.name),
			),
		);
		const assign = b.stmt(b.assignment('=', b.id(component.name), existing));
		output.push(inheritGeneratedOrigin(b.if(test, b.block([update, assign])), componentOrigin));
	}
	return output;
}

function hmrComponentObject(state, existing, origin) {
	return inheritGeneratedOrigin(
		b.object([
			b.spread(existing),
			...state.hmrComponents.map((component) =>
				b.prop('init', b.id(component.name), b.id(component.name), false, true),
			),
		]),
		origin,
	);
}

function buildUniversalHmrBlocksAst(state, origin) {
	const disposals = hmrDisposalStatements(state, origin);
	if (state.hmrComponents.length === 0 && disposals.length === 0) {
		return { prelude: [], tail: [] };
	}
	if (state.hmrDialect === 'webpack') {
		const hot = importMetaMember('webpackHot', origin);
		const prelude = [];
		const tail = [];
		if (disposals.length === 0) {
			const data = generatedIdentifier('data', origin);
			const store = inheritGeneratedOrigin(b.member(data, '__octaneUniversalComponents'), origin);
			const dispose = b.stmt(
				b.call(
					b.member(hot, 'dispose'),
					b.arrow(
						[data],
						b.block([b.stmt(b.assignment('=', store, hmrComponentObject(state, store, origin)))]),
					),
				),
			);
			tail.push(
				inheritGeneratedOrigin(
					b.if(
						hot,
						b.block([
							...hmrHandoffStatements(state, hot, origin),
							dispose,
							b.stmt(b.call(b.member(hot, 'accept'))),
						]),
					),
					origin,
				),
			);
			return { prelude, tail };
		}
		const ready =
			state.hmrComponents.length === 0
				? null
				: allocName(state, '__octaneUniversalHmrComponentsReady');
		if (ready !== null) prelude.push(generatedConst(ready, b.literal(false), origin, 'let'));
		const data = generatedIdentifier('data', origin);
		const store = inheritGeneratedOrigin(b.member(data, '__octaneUniversalComponents'), origin);
		const disposalBody = [];
		if (ready !== null) {
			disposalBody.push(
				b.if(
					b.id(ready),
					b.block([b.stmt(b.assignment('=', store, hmrComponentObject(state, store, origin)))]),
				),
			);
		}
		disposalBody.push(...disposals);
		prelude.push(
			inheritGeneratedOrigin(
				b.if(
					hot,
					b.block([
						b.stmt(b.call(b.member(hot, 'dispose'), b.arrow([data], b.block(disposalBody)))),
					]),
				),
				origin,
			),
		);
		if (ready !== null) {
			tail.push(
				inheritGeneratedOrigin(
					b.if(
						hot,
						b.block([
							...hmrHandoffStatements(state, hot, origin),
							b.stmt(b.assignment('=', b.id(ready), b.literal(true))),
							b.stmt(b.call(b.member(hot, 'accept'))),
						]),
					),
					origin,
				),
			);
		}
		return { prelude, tail };
	}
	const hot = importMetaMember('hot', origin);
	const prelude =
		disposals.length === 0
			? []
			: [
					inheritGeneratedOrigin(
						b.if(
							hot,
							b.block([b.stmt(b.call(b.member(hot, 'dispose'), b.arrow([], b.block(disposals))))]),
						),
						origin,
					),
				];
	const tail =
		state.hmrComponents.length === 0
			? []
			: [
					inheritGeneratedOrigin(
						b.if(
							hot,
							b.block([
								b.stmt(
									b.call(
										b.member(hot, 'accept'),
										b.arrow(
											[b.id('module')],
											b.block(
												state.hmrComponents.map((component) => {
													const incoming =
														component.exportKind === 'default'
															? b.member(b.id('module'), 'default')
															: b.member(b.id('module'), component.name);
													return b.stmt(
														b.call(
															b.member(
																b.member(b.id(component.name), b.id(state.helpers.hmrSymbol), true),
																'update',
															),
															incoming,
														),
													);
												}),
											),
										),
									),
								),
							]),
						),
						origin,
					),
				];
	return { prelude, tail };
}

/**
 * Lower an already parsed renderer-owned region without printing or reparsing
 * generated source. Authored region/component nodes retain their locations;
 * generated scaffolding inherits the nearest authored origin.
 */
export function lowerUniversalRendererRegionAst(
	regionExpression,
	filename,
	ownerRenderer,
	renderer,
	index,
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
	const origin = regionExpression;
	const runtimeImports = options.runtimeImports ?? [];
	const runtimeImportAst =
		runtimeImports.length === 0
			? null
			: inheritGeneratedOrigin(
					b.imports(
						runtimeImports.map(({ imported, local }) => [imported, local]),
						'octane',
					),
					origin,
				);
	const analysisEntryName = `${prefix}Source`;
	const analysisEntry = generatedConst(analysisEntryName, regionExpression, origin);
	const componentStatements = options.components ?? [];
	const analysisAst = {
		type: 'Program',
		sourceType: 'module',
		body: [
			...(runtimeImportAst === null ? [] : [runtimeImportAst]),
			...componentStatements,
			analysisEntry,
		],
		start: origin?.start,
		end: origin?.end,
		loc: origin?.loc,
		metadata: { path: [] },
	};
	const hmrDialect = options.hmr === true ? 'vite' : options.hmr || false;
	const state = {
		source: options.authoredSource ?? '',
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
		componentNames: collectComponentNames(analysisAst),
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

	const specializationBindings = new Set();
	const entryExcluded = new Set(runtimeImports.map(({ local }) => local));
	for (const region of options.deferredRendererRegions ?? []) entryExcluded.add(region.token);
	for (const statement of componentStatements) {
		const declaration =
			statement.type === 'ExportNamedDeclaration' || statement.type === 'ExportDefaultDeclaration'
				? statement.declaration
				: statement;
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
	const entryCaptureCandidates = collectEntryCaptures(regionExpression, entryExcluded)
		.filter((capture) => !UNIVERSAL_REALM_GLOBALS.has(capture.source))
		.map((capture) => ({ ...capture, local: capture.source }));
	state.threadExternalCaptures = new Set(entryCaptureCandidates.map((capture) => capture.source));
	validateRuntimeImports(analysisAst, state);
	prepareThreadFunctionAstReplacements(analysisAst, state);
	const entryCaptures = entryCaptureCandidates.filter((capture) =>
		capture.nodes.some((node) => isThreadNodeActive(state, node)),
	);
	if (renderer.validation !== undefined && options.authoredAst && options.validationRanges) {
		validateRendererSourceRanges(
			options.authoredAst,
			state,
			options.validationRanges,
			options.validationExclusions,
		);
	} else if (renderer.validation !== undefined) {
		validateRendererSource(analysisAst, state);
	}
	prepareMainThreadRenderOnlyAstReplacements(analysisAst, state);

	const emittedComponents = [];
	for (const statement of componentStatements) {
		emittedComponents.push(...(state.astNodePrefixes?.get(statement) ?? []));
		const shape = componentShape(statement, state);
		const component = shape === null ? null : emitComponentAst(shape, state);
		if (component === null) {
			assertNoResidualTemplate(statement, state, 'a renderer specialization helper');
			const rewritten = rewriteSourceAst(statement, state);
			if (rewritten !== null) emittedComponents.push(rewritten);
		} else {
			emittedComponents.push(...component);
		}
	}
	state.astNodeReplacements ??= new WeakMap();
	for (const capture of entryCaptures) {
		for (const node of capture.nodes) {
			state.astNodeReplacements.set(node, generatedIdentifier(capture.local, node));
		}
	}
	const deferredRendererNodes = collectIdentifierNodes(
		regionExpression,
		new Set((options.deferredRendererRegions ?? []).map((region) => region.token)),
	);
	for (const [regionIndex, region] of (options.deferredRendererRegions ?? []).entries()) {
		const local = allocName(state, `${prefix}RendererRegionRender${regionIndex}`);
		const descriptor = generatedCall(
			region.helper,
			[
				b.literal(region.ownerRenderer.id),
				b.literal(region.childRenderer.id),
				b.id(region.body),
				b.object([b.prop('init', b.id('render'), b.id(local))]),
			],
			origin,
		);
		for (const node of deferredRendererNodes.get(region.token) ?? []) {
			state.astNodeReplacements.set(node, descriptor);
		}
		entryCaptures.push({ local, nodes: [], source: region.renderToken });
	}
	const entryUseSetup = extractEntryParallelUsesAst(regionExpression, state);
	const loweredExpression = isTemplateNode(regionExpression)
		? compileRenderableExpressionAst(regionExpression, state)
		: rewriteSourceAst(regionExpression, state);
	const regionHelper = allocName(state, `${prefix}Descriptor`);
	const componentName = allocName(state, `${prefix}Body`);
	const entryProps = generatedIdentifier(allocName(state, `${prefix}EntryProps`), origin);
	const componentBody = [];
	if (entryCaptures.length > 0) {
		componentBody.push(
			inheritGeneratedOrigin(
				b.const(
					b.array_pattern(
						entryCaptures.map((capture) => generatedIdentifier(capture.local, origin)),
					),
					b.member(entryProps, 'captures'),
				),
				origin,
			),
		);
	}
	componentBody.push(...entryUseSetup, inheritGeneratedOrigin(b.return(loweredExpression), origin));
	const componentFunction = inheritGeneratedOrigin(
		b.function(generatedIdentifier(componentName, origin), [entryProps], b.block(componentBody)),
		origin,
	);
	let componentValue = generatedCall(
		state.helpers.component,
		[
			b.literal(renderer.id),
			componentFunction,
			jsonValueToAst({ module: renderer.module }, origin),
		],
		origin,
	);
	state.components.push({
		name: componentName,
		exportKind: 'named',
		line: origin?.loc?.start?.line ?? 0,
		column: origin?.loc?.start?.column ?? 0,
		hooks: collectAuthoredHookSites({ body: regionExpression }, state),
	});
	if (state.hmr) {
		componentValue = generatedCall(
			state.helpers.hmr,
			[b.literal(renderer.id), componentValue],
			origin,
		);
		state.hmrComponents.push({ name: componentName, exportKind: 'named', origin });
	}
	if (state.profile) {
		const loc = origin?.loc?.start;
		componentValue = generatedCall(
			state.helpers.profile,
			[
				componentValue,
				jsonValueToAst(
					{
						id: `${state.profileFilename || filename || '<anon>'}#${componentName}@${
							loc?.line ?? 0
						}:${loc?.column ?? 0}`,
						name: componentName,
						file: state.profileFilename || filename || '<anon>',
						line: loc?.line ?? 0,
						column: loc?.column ?? 0,
						kind: 'component',
					},
					origin,
				),
			],
			origin,
		);
	}
	const componentDeclaration = inheritGeneratedOrigin(
		b.export(
			generatedConst(
				componentName,
				componentValue,
				origin,
				state.hmrDialect === 'webpack' ? 'let' : 'const',
			),
		),
		origin,
	);
	specializationBindings.add(componentName);
	const hmrBlocks = buildUniversalHmrBlocksAst(state, origin);
	const profileImport = universalProfileImportAst(state, origin);
	const helperImportPairs = [
		['rendererRegion', regionHelper],
		...runtimeImports.map(({ imported, local }) => [imported, local]),
		...Object.entries(generatedRuntimeAliases),
	];
	const descriptor = generatedCall(
		regionHelper,
		[
			b.literal(ownerRenderer.id ?? ownerRenderer),
			b.literal(renderer.id),
			b.id(componentName),
			b.object([
				b.prop(
					'init',
					b.id('captures'),
					b.array(entryCaptures.map((capture) => generatedIdentifier(capture.source, origin))),
				),
			]),
		],
		origin,
	);
	return Object.freeze({
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
			runtimeAliases: Object.freeze(runtimeImports.map(({ local }) => local)),
			runtimeImports: Object.freeze(runtimeImports),
			...(universalRuntime === undefined ? null : { universalRuntime }),
		}),
		statements: Object.freeze([
			universalHelperImportAst(state, helperImportPairs, origin),
			...(profileImport === null ? [] : [profileImport]),
			...hmrBlocks.prelude,
			...universalPlanDeclarationsAst(state, origin),
			...(state.threadFunctionRegistrationsAst ?? []),
			...emittedComponents,
			componentDeclaration,
			...hmrBlocks.tail,
		]),
		expression: descriptor,
		validationImportReferences: Object.freeze(state.validationImportReferences),
	});
}

/**
 * @param {string} source
 * @param {string} filename
 * @param {{ id: string, module: string, target: 'universal', text?: 'host'|'ignore'|'reject', capabilities?: readonly string[], firstScreenEvents?: readonly string[] }} renderer
 * @param {(ast: import('@tsrx/core/types').AST.Program, metadata: any) => { code: string, map: any }} compileClient
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
	prepareThreadFunctionAstReplacements(ast, state);
	if (renderer.validation !== undefined) {
		if (options.__universalValidationAst && options.__universalValidationRanges) {
			validateRendererSourceRanges(
				options.__universalValidationAst,
				state,
				options.__universalValidationRanges,
				options.__universalValidationExclusions,
			);
		} else if (options.__universalValidationAst) {
			validateRendererSource(options.__universalValidationAst, state);
		} else {
			validateRendererSource(ast, state);
		}
	}
	prepareMainThreadRenderOnlyAstReplacements(ast, state);

	const emitted = [];
	for (const node of ast.body ?? []) {
		emitted.push(...(state.astNodePrefixes?.get(node) ?? []));
		const shape = componentShape(node, state);
		if (shape !== null) {
			const component = emitComponentAst(shape, state);
			if (component !== null) {
				emitted.push(...component);
				continue;
			}
		}
		assertNoResidualTemplate(node, state, 'an unsupported module declaration');
		const rewritten = rewriteSourceAst(node, state);
		if (rewritten !== null) emitted.push(rewritten);
	}

	const moduleOrigin = ast.body?.[0] ?? ast;
	const hmrBlocks = buildUniversalHmrBlocksAst(state, moduleOrigin);
	const metadata = {
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
	};
	const profileImport = universalProfileImportAst(state, moduleOrigin);
	const program = {
		...ast,
		body: [
			universalHelperImportAst(state, [], moduleOrigin),
			...(profileImport === null ? [] : [profileImport]),
			...hmrBlocks.prelude,
			...universalPlanDeclarationsAst(state, moduleOrigin),
			...(state.threadFunctionRegistrationsAst ?? []),
			...emitted,
			...hmrBlocks.tail,
		],
	};
	const result = compileClient(program, metadata);
	return {
		...result,
		...(universalRuntime === undefined ? null : { universalRuntime }),
	};
}
