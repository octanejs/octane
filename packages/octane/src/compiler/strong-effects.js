// Strong effect lifecycle proofs. The Strong visitor owns execution phases and
// state provenance; this policy owns the questions it asks about effect setup:
// which platform calls run their callback before the next paint, whether an
// asynchronous state update is cancelled or ignored by the returned cleanup,
// whether a platform resource acquired in setup is released, and which refs are
// plain values rather than attached instances. Identity comes from the shared
// lexical analysis, never from spelling. Nothing here annotates the parser tree
// or changes emitted code.

export const STRONG_EFFECT_DATA_FETCH = 'OCTANE_STRONG_EFFECT_DATA_FETCH';
export const STRONG_EFFECT_HIDDEN_DEPENDENCY = 'OCTANE_STRONG_EFFECT_HIDDEN_DEPENDENCY';
export const STRONG_EFFECT_RESOURCE_LEAK = 'OCTANE_STRONG_EFFECT_RESOURCE_LEAK';

const TRANSPARENT = new Set([
	'ChainExpression',
	'ParenthesizedExpression',
	'TSAsExpression',
	'TSInstantiationExpression',
	'TSNonNullExpression',
	'TSSatisfiesExpression',
	'TSTypeAssertion',
]);
const FUNCTIONS = new Set(['ArrowFunctionExpression', 'FunctionExpression', 'FunctionDeclaration']);
const SKIP_KEYS = new Set([
	'type',
	'start',
	'end',
	'loc',
	'range',
	'parent',
	'metadata',
	'comments',
	'tokens',
	'typeAnnotation',
	'returnType',
	'typeParameters',
]);
const CONTINUATIONS = new Set(['then', 'catch', 'finally']);
// `window`, `self` and `globalThis` name one object in a browser.
const GLOBAL_OBJECTS = new Set(['window', 'self', 'globalThis']);
const EVENT_TARGET_GLOBALS = new Set([
	...GLOBAL_OBJECTS,
	'document',
	'navigator',
	'screen',
	'visualViewport',
]);
const OBSERVERS = new Set([
	'ResizeObserver',
	'IntersectionObserver',
	'MutationObserver',
	'PerformanceObserver',
]);
const CLOSABLES = new Set(['WebSocket', 'EventSource', 'BroadcastChannel']);
const DEPENDENCY_ARGUMENTS = new Map([
	['useEffect', 1],
	['useLayoutEffect', 1],
	['useInsertionEffect', 1],
	['useMemo', 1],
	['useCallback', 1],
	['useImperativeHandle', 2],
]);
const UNKNOWN = Symbol('unknown');

const HIDDEN_MESSAGES = {
	getter:
		'Strong mode does not allow effect setup to call a state getter. The getter hides the state from dependency inference, so the effect does not re-run when it changes. Read the render snapshot instead, or move the non-reactive read into a useEffectEvent callback.',
	ref: "Strong mode does not allow effect setup to read a value ref's current property. The ref hides the value from dependency inference, so the effect does not re-run when it changes. Read the render snapshot instead, or move the non-reactive read into a useEffectEvent callback. Octane never double-invokes effects, and an effect without reactive inputs runs once per mount, so first-run and didInit guards are unnecessary.",
	module:
		'Strong mode does not allow effect setup to read a reassigned module variable. The variable hides the value from dependency inference and is shared by every instance. Keep the value in state, a prop, or context and read its snapshot, or move the non-reactive read into a useEffectEvent callback. Octane never double-invokes effects, so didInit guards are unnecessary.',
};
const FETCH_MESSAGES = {
	missing:
		'Strong mode requires cleanup for a state update that runs after an await or promise callback in an effect. Read asynchronous render data with use() or a query binding. For external synchronization, pass an AbortController signal to the request and abort it in the returned cleanup, or set a flag in the cleanup and check it before this update.',
	async:
		'Strong mode requires cleanup for a state update that runs after an await in an effect, but an async effect callback returns a promise instead of cleanup. Read asynchronous render data with use() or a query binding, or start the async work inside a synchronous effect whose returned cleanup aborts it or sets a flag checked before this update.',
	ineffective:
		'Strong mode requires the effect cleanup to cancel or ignore this asynchronous state update, but the returned cleanup does neither. Abort an AbortController whose signal is passed to the request, or set a flag in the cleanup and check it before this update, after the last await.',
};
const LEAK_MESSAGES = {
	listener:
		'Strong mode requires effect cleanup to remove this event listener. Keep the handler in a variable and pass it to removeEventListener in the returned cleanup, with the same capture option, or pass an AbortController signal in the listener options and abort it in cleanup.',
	property:
		'Strong mode requires effect cleanup to remove this event handler property. Assign null to it in the returned cleanup, or use addEventListener with a matching removeEventListener.',
	interval:
		'Strong mode requires effect cleanup to stop this interval. Keep the ID returned by setInterval and call clearInterval(id) in the returned cleanup.',
	loop: 'Strong mode requires effect cleanup to stop this self-rescheduling timer. Store every timer ID in one variable and cancel it with clearTimeout or cancelAnimationFrame in the returned cleanup.',
	observer:
		'Strong mode requires effect cleanup to disconnect this observer. Keep the observer in a variable and call disconnect() in the returned cleanup.',
	closable:
		'Strong mode requires effect cleanup to close this connection. Keep it in a variable and call close() in the returned cleanup.',
	watch:
		'Strong mode requires effect cleanup to stop this geolocation watch. Keep the ID returned by watchPosition and call navigator.geolocation.clearWatch(id) in the returned cleanup.',
};

function unwrap(node) {
	while (node && TRANSPARENT.has(node.type)) node = node.expression;
	return node;
}

function memberName(member) {
	if (member.computed !== true)
		return member.property?.type === 'Identifier' ? member.property.name : null;
	const property = unwrap(member.property);
	return property?.type === 'Literal' && typeof property.value === 'string' ? property.value : null;
}

function lookup(scope, name) {
	for (let current = scope; current; current = current.parent) {
		const binding = current.bindings.get(name);
		if (binding !== undefined) return binding;
	}
	return null;
}

function functionScopeOf(scope) {
	let current = scope;
	while (current && current.kind !== 'function' && current.kind !== 'module')
		current = current.parent;
	return current;
}

/**
 * @param {object} config
 * @param {object} config.analysis Shared lexical analysis from analyzeStrongHookBindings.
 * @param {Map<object, string>} config.callNames Canonical Octane names for authored calls.
 * @param {(code: string, node: object, message: string) => void} config.report
 */
export function createStrongEffectPolicy({ ast, analysis, callNames, report }) {
	const { nodeScopes, declarators, functions } = analysis;
	let declaratorInfo = null;
	let functionNodes = null;
	let references = null;
	let flow = { segment: 0, controllers: null };
	let guards = null;
	let segments = 0;
	// Arguments of the local calls being visited, so a signal passed to a helper
	// parameter still identifies its AbortController.
	let frames = null;
	let parameterLists = null;
	const scans = new WeakMap();
	const activeScans = new Set();

	function parametersOf(fn) {
		if (parameterLists === null) {
			parameterLists = new Map();
			for (const record of functions) parameterLists.set(record.node, record.parameters ?? []);
		}
		return parameterLists.get(fn) ?? [];
	}

	function frameArgument(binding) {
		for (let frame = frames; frame !== null; frame = frame.next) {
			const index = frame.parameters.indexOf(binding);
			if (index !== -1) {
				const argument = frame.args?.[index];
				return argument?.type === 'SpreadElement' ? null : (argument ?? null);
			}
		}
		return null;
	}

	// undefined: not an analyzed reference; null: an unshadowed global.
	function bindingOf(identifier) {
		const scope = nodeScopes.get(identifier);
		return scope === undefined ? undefined : lookup(scope, identifier.name);
	}

	function declarator(binding) {
		if (declaratorInfo === null) {
			declaratorInfo = new Map();
			const collect = (pattern, decl, kind, path) => {
				if (pattern?.type === 'Identifier') {
					const scope = nodeScopes.get(decl);
					const binding = scope && lookup(scope, pattern.name);
					if (binding) declaratorInfo.set(binding, { decl, kind, path, pattern });
				} else if (pattern?.type === 'ObjectPattern' && path.length === 0) {
					for (const property of pattern.properties ?? []) {
						if (property.type !== 'Property') continue;
						const key = property.computed
							? unwrap(property.key)?.type === 'Literal'
								? unwrap(property.key).value
								: null
							: property.key?.name;
						if (typeof key === 'string') collect(property.value, decl, kind, [key]);
					}
				}
			};
			for (const { decl, kind } of declarators) collect(decl.id, decl, kind, []);
		}
		return declaratorInfo.get(binding) ?? null;
	}

	// The initializer of a binding that always holds it: const, or never reassigned.
	function stableInit(binding) {
		if (binding == null || binding.reassigned) return null;
		const info = declarator(binding);
		return info === null || info.path.length !== 0 ? null : unwrap(info.decl.init);
	}

	function stableInitOf(expression) {
		const node = unwrap(expression);
		return node?.type === 'Identifier' ? stableInit(bindingOf(node)) : null;
	}

	function functionOf(expression, depth = 0) {
		const node = unwrap(expression);
		if (FUNCTIONS.has(node?.type)) return node;
		if (node?.type !== 'Identifier' || depth > 8) return null;
		const binding = bindingOf(node);
		if (binding == null || binding.reassigned) return null;
		if (functionNodes === null) {
			functionNodes = new Map();
			for (const record of functions) {
				if (record.binding) functionNodes.set(record.binding, record.node);
			}
		}
		return functionNodes.get(binding) ?? functionOf(stableInit(binding), depth + 1);
	}

	// A canonical source key for a receiver, handle, or handler. Stable aliases
	// resolve to what they alias, so `const el = ref.current` names `ref.current`.
	function keyOf(expression, depth = 0) {
		const node = unwrap(expression);
		if (node?.type === 'Identifier') {
			const binding = bindingOf(node);
			if (binding === undefined) return null;
			if (binding === null) return GLOBAL_OBJECTS.has(node.name) ? 'g:window' : `g:${node.name}`;
			// A helper parameter names the argument of the call being visited.
			const argument = depth < 8 ? frameArgument(binding) : null;
			if (argument !== null) {
				const key = keyOf(argument, depth + 1);
				if (key !== null) return key;
			}
			if (!binding.reassigned && depth < 8) {
				const info = declarator(binding);
				const init = info === null ? null : unwrap(info.decl.init);
				if (init?.type === 'Identifier' || init?.type === 'MemberExpression') {
					const base = keyOf(init, depth + 1);
					if (base !== null) return info.path.length === 0 ? base : `${base}.${info.path[0]}`;
				}
			}
			return `b${binding.id}`;
		}
		if (node?.type === 'MemberExpression') {
			const property = memberName(node);
			const object = property === null ? null : keyOf(node.object, depth);
			if (object === null) return null;
			if (object === 'g:window') return GLOBAL_OBJECTS.has(property) ? object : `g:${property}`;
			return `${object}.${property}`;
		}
		return null;
	}

	function staticValue(expression, depth = 0) {
		const node = unwrap(expression);
		if (node?.type === 'Literal') return node.value;
		if (node?.type === 'Identifier') {
			const binding = bindingOf(node);
			if (node.name === 'undefined' && binding === null) return undefined;
			if (depth >= 8 || binding == null) return UNKNOWN;
			// A helper parameter holds the argument of the call being visited.
			return staticValue(frameArgument(binding) ?? stableInit(binding), depth + 1);
		}
		if (node?.type === 'UnaryExpression') {
			if (node.operator === 'void') return undefined;
			const argument = staticValue(node.argument, depth);
			if (argument === UNKNOWN) return UNKNOWN;
			if (node.operator === '!') return !argument;
			if (node.operator === '-' && typeof argument === 'number') return -argument;
			if (node.operator === '+' && typeof argument === 'number') return argument;
		}
		return UNKNOWN;
	}

	// The operand a conditional or logical expression evaluates to when its
	// test or left operand is a known value, as in `null && pending`.
	function selected(node) {
		if (node.type === 'ConditionalExpression') {
			const test = staticValue(node.test);
			return test === UNKNOWN ? null : test ? node.consequent : node.alternate;
		}
		const left = staticValue(node.left);
		if (left === UNKNOWN) return null;
		const keepsLeft =
			node.operator === '??' ? left != null : node.operator === '&&' ? !left : Boolean(left);
		return keepsLeft ? node.left : node.right;
	}

	// Some value a conditional or logical expression can evaluate to passes `check`.
	function someResult(node, check, depth) {
		const only = selected(node);
		if (only !== null) return check(only, depth);
		return node.type === 'ConditionalExpression'
			? check(node.consequent, depth) || check(node.alternate, depth)
			: check(node.left, depth) || check(node.right, depth);
	}

	// Awaiting the value may resume in a microtask, before the next paint: some
	// value it can evaluate to is a non-thenable or an already settled promise.
	function maySettle(expression, depth = 0) {
		const node = unwrap(expression);
		if (node == null) return true;
		switch (node.type) {
			case 'Literal':
			case 'TemplateLiteral':
			case 'UnaryExpression':
			case 'UpdateExpression':
			case 'BinaryExpression':
			case 'ArrowFunctionExpression':
			case 'FunctionExpression':
			case 'ClassExpression':
			case 'ArrayExpression':
			// Awaiting unwraps thenables, so an await result is never one.
			case 'AwaitExpression':
				return true;
			case 'ObjectExpression':
				return (node.properties ?? []).every(
					(property) =>
						property.type === 'Property' &&
						property.computed !== true &&
						(property.key?.name ?? property.key?.value) !== 'then',
				);
			case 'Identifier': {
				if (node.name === 'undefined' && bindingOf(node) === null) return true;
				const init = depth < 8 ? stableInitOf(node) : null;
				return init !== null && maySettle(init, depth + 1);
			}
			case 'SequenceExpression':
				return maySettle(node.expressions?.at(-1), depth);
			case 'ConditionalExpression':
			case 'LogicalExpression':
				return someResult(node, maySettle, depth);
			case 'CallExpression':
				return settledPromise(node);
			default:
				return false;
		}
	}

	// A promise that may settle without waiting on anything else.
	function maySettlePromise(expression, depth = 0) {
		const node = unwrap(expression);
		switch (node?.type) {
			case 'Identifier':
				return depth < 8 && maySettlePromise(stableInitOf(node), depth + 1);
			case 'SequenceExpression':
				return maySettlePromise(node.expressions?.at(-1), depth);
			case 'ConditionalExpression':
			case 'LogicalExpression':
				return someResult(node, maySettlePromise, depth);
			case 'CallExpression':
				return settledPromise(node);
			default:
				return false;
		}
	}

	function settledPromise(node) {
		const callee = unwrap(node.callee);
		if (callee?.type !== 'MemberExpression' || keyOf(callee.object) !== 'g:Promise') return false;
		const method = memberName(callee);
		return method === 'reject' || (method === 'resolve' && maySettle(node.arguments?.[0]));
	}

	function globalFunction(callee) {
		const node = unwrap(callee);
		const key = keyOf(node);
		return key?.startsWith('g:') && !key.includes('.') ? key.slice(2) : null;
	}

	function zeroDelay(expression) {
		if (expression == null) return true;
		const value = staticValue(expression);
		if (value === UNKNOWN || (value !== null && typeof value === 'object')) return false;
		const delay = typeof value === 'bigint' || typeof value === 'symbol' ? NaN : Number(value);
		return !(delay > 0);
	}

	function signalController(expression, depth = 0) {
		const node = unwrap(expression);
		if (depth > 8) return null;
		if (node?.type === 'MemberExpression') {
			if (memberName(node) !== 'signal') return null;
			const object = unwrap(node.object);
			return object?.type === 'Identifier' ? controllerOf(bindingOf(object)) : null;
		}
		if (node?.type !== 'Identifier') return null;
		const binding = bindingOf(node);
		if (binding == null || binding.reassigned) return null;
		const argument = frameArgument(binding);
		if (argument !== null) return signalController(argument, depth + 1);
		const info = declarator(binding);
		const init = info === null ? null : unwrap(info.decl.init);
		if (info?.path.length === 1 && info.path[0] === 'signal' && init?.type === 'Identifier') {
			return controllerOf(bindingOf(init));
		}
		return info?.path.length === 0 ? signalController(init, depth + 1) : null;
	}

	// The AbortController a binding holds: one created by `new AbortController()`,
	// reached through stable aliases and the arguments of the helpers being visited.
	function controllerOf(binding, depth = 0) {
		if (binding == null || depth > 8) return null;
		const argument = frameArgument(binding);
		const source = unwrap(argument ?? stableInit(binding));
		if (source?.type === 'Identifier') return controllerOf(bindingOf(source), depth + 1);
		return argument === null &&
			source?.type === 'NewExpression' &&
			globalFunction(source.callee) === 'AbortController'
			? binding
			: null;
	}

	function signalsIn(node, into) {
		if (node == null || typeof node !== 'object') return into;
		if (Array.isArray(node)) {
			for (const child of node) into = signalsIn(child, into);
			return into;
		}
		if (FUNCTIONS.has(node.type)) return into;
		// A request can read the signal of a controller passed to it.
		const controller =
			signalController(node) ?? (node.type === 'Identifier' ? controllerOf(bindingOf(node)) : null);
		if (controller !== null) (into ??= new Set()).add(controller);
		for (const key in node) {
			if (SKIP_KEYS.has(key) || key.startsWith('_octane')) continue;
			// Member names and object keys are not references, as in `props.controller`.
			if (node.computed !== true && (key === 'property' || key === 'key')) continue;
			into = signalsIn(node[key], into);
		}
		return into;
	}

	// Controllers whose abort rejects the promise a continuation follows: the
	// request's own signal, or the signal of the request whose result it reads,
	// as in `(await fetch(url, { signal })).json()`. A value that may come from
	// either side of a conditional or logical expression keeps the shared ones.
	function requestControllers(expression, depth = 0) {
		const node = unwrap(expression);
		if (node == null || depth > 8) return null;
		switch (node.type) {
			case 'AwaitExpression':
				return requestControllers(node.argument, depth + 1);
			case 'SequenceExpression':
				return requestControllers(node.expressions?.at(-1), depth + 1);
			case 'ConditionalExpression':
				return sharedControllers(
					requestControllers(node.consequent, depth + 1),
					requestControllers(node.alternate, depth + 1),
				);
			case 'LogicalExpression':
				return sharedControllers(
					requestControllers(node.left, depth + 1),
					requestControllers(node.right, depth + 1),
				);
			case 'Identifier': {
				const init = stableInitOf(node);
				return init === null ? null : requestControllers(init, depth + 1);
			}
			case 'CallExpression':
			case 'NewExpression': {
				const callee = unwrap(node.callee);
				const member = callee?.type === 'MemberExpression';
				// A .then chain follows the promise at its head.
				if (node.type === 'CallExpression' && member && CONTINUATIONS.has(memberName(callee))) {
					return requestControllers(callee.object, depth + 1);
				}
				let controllers = signalsIn(node.arguments, null);
				const receiver = member ? requestControllers(callee.object, depth + 1) : null;
				if (receiver !== null)
					for (const controller of receiver) (controllers ??= new Set()).add(controller);
				return controllers;
			}
			default:
				return null;
		}
	}

	function sharedControllers(left, right) {
		if (left === null || right === null) return null;
		let controllers = null;
		for (const controller of left) {
			if (right.has(controller)) (controllers ??= new Set()).add(controller);
		}
		return controllers;
	}

	// Paths that meet keep only the proofs they share. If any path yielded, the
	// joined code runs in a new segment, so earlier guards no longer hold.
	function joinFlow(left, right) {
		if (left === right) return left;
		return {
			segment: left.segment === right.segment ? left.segment : ++segments,
			controllers: sharedControllers(left.controllers, right.controllers),
		};
	}

	function containsAwait(node) {
		if (node == null || typeof node !== 'object') return false;
		if (Array.isArray(node)) return node.some(containsAwait);
		if (FUNCTIONS.has(node.type)) return false;
		if (
			node.type === 'AwaitExpression' ||
			(node.type === 'ForOfStatement' && node.await === true)
		) {
			return true;
		}
		for (const key in node) {
			if (!SKIP_KEYS.has(key) && !key.startsWith('_octane') && containsAwait(node[key]))
				return true;
		}
		return false;
	}

	function guardTokens(test, truthy, tokens) {
		const node = unwrap(test);
		if (node?.type === 'UnaryExpression' && node.operator === '!') {
			return guardTokens(node.argument, !truthy, tokens);
		}
		if (node?.type === 'LogicalExpression') {
			if ((node.operator === '&&' && truthy) || (node.operator === '||' && !truthy)) {
				tokens = guardTokens(node.left, truthy, tokens);
				return guardTokens(node.right, truthy, tokens);
			}
			return tokens;
		}
		if (node?.type === 'BinaryExpression' && ['===', '!==', '==', '!='].includes(node.operator)) {
			const left = staticValue(node.left);
			const literal = typeof left === 'boolean' ? left : staticValue(node.right);
			if (typeof literal !== 'boolean') return tokens;
			const equal = node.operator === '===' || node.operator === '==';
			return guardTokens(
				typeof left === 'boolean' ? node.right : node.left,
				equal === truthy ? literal : !literal,
				tokens,
			);
		}
		if (node?.type === 'Identifier') {
			const binding = bindingOf(node);
			if (binding) (tokens ??= []).push({ binding, truthy, segment: flow.segment });
		} else if (node?.type === 'MemberExpression' && memberName(node) === 'aborted') {
			const controller = signalController(node.object);
			if (controller !== null) {
				(tokens ??= []).push({ controller, truthy, segment: flow.segment });
			}
		}
		return tokens;
	}

	function pushGuard(test, truthy) {
		const saved = guards;
		const tokens = guardTokens(test, truthy, null);
		if (tokens !== null) for (const token of tokens) guards = { token, next: guards };
		return saved;
	}

	// Statements after `if (test) return;` run only when the test was false.
	function statementGuard(statement, exits) {
		if (statement?.type !== 'IfStatement') return;
		const consequentExits = exits(statement.consequent);
		const alternateExits = statement.alternate != null && exits(statement.alternate);
		if (consequentExits && !alternateExits) pushGuard(statement.test, false);
		else if (alternateExits && !consequentExits) pushGuard(statement.test, true);
	}

	// A yield resumes in a later segment, protected only by its own request.
	function continue_(expression) {
		flow = {
			segment: ++segments,
			controllers: expression == null ? null : requestControllers(expression),
		};
	}

	// --- cleanup scanning ----------------------------------------------------

	// What a cleanup does synchronously: flags it assigns, controllers it aborts,
	// listeners it removes, handles it clears, and objects it disposes.
	function emptyCleanup() {
		return {
			flags: new Map(),
			aborted: new Set(),
			removed: [],
			cleared: new Set(),
			disposed: new Set(),
			properties: new Set(),
		};
	}

	function mergeCleanup(result, child) {
		for (const [binding, values] of child.flags) {
			let target = result.flags.get(binding);
			if (target === undefined) result.flags.set(binding, (target = new Set()));
			for (const value of values) target.add(value);
		}
		for (const value of child.aborted) result.aborted.add(value);
		result.removed.push(...child.removed);
		for (const value of child.cleared) result.cleared.add(value);
		for (const value of child.disposed) result.disposed.add(value);
		for (const value of child.properties) result.properties.add(value);
	}

	// A helper called from cleanup is scanned with its call's arguments, so its
	// parameters name what the caller passed. Only unframed scans are cached.
	// `outer` holds the frames a cleanup closed over, such as the arguments of
	// the helper call that returned it.
	function scan(fn, args = null, outer = null) {
		const parameters = args === null ? [] : parametersOf(fn);
		const framed = parameters.length !== 0;
		const cacheable = !framed && outer === null && frames === null;
		if (cacheable && scans.has(fn)) return scans.get(fn);
		if (activeScans.has(fn)) return emptyCleanup();
		const result = emptyCleanup();
		// Cache first: a cleanup helper cycle then sees a partial result.
		if (cacheable) scans.set(fn, result);
		activeScans.add(fn);
		const enclosingFrames = frames;
		if (outer !== null) frames = outer;
		if (framed) frames = { parameters, args, next: frames };
		const visit = (node) => {
			if (node == null || typeof node !== 'object') return;
			if (Array.isArray(node)) {
				for (const child of node) visit(child);
				return;
			}
			if (FUNCTIONS.has(node.type) || node.type === 'ClassBody') return;
			if (node.type === 'AssignmentExpression') {
				const left = unwrap(node.left);
				if (node.operator === '=' && left?.type === 'Identifier') {
					const binding = bindingOf(left);
					const value = staticValue(node.right);
					if (binding) {
						let values = result.flags.get(binding);
						if (values === undefined) result.flags.set(binding, (values = new Set()));
						values.add(value === UNKNOWN ? UNKNOWN : Boolean(value));
					} else if (binding === null) {
						result.properties.add(keyOf(left));
					}
				} else if (left?.type === 'MemberExpression') {
					const key = keyOf(left);
					if (key !== null) result.properties.add(key);
				}
			} else if (node.type === 'CallExpression') {
				const callee = unwrap(node.callee);
				const inline = functionOf(callee);
				if (inline !== null && inline !== fn && inline.async !== true && !inline.generator) {
					mergeCleanup(result, scan(inline, node.arguments ?? []));
				}
				const name = globalFunction(callee);
				if (
					name === 'clearInterval' ||
					name === 'clearTimeout' ||
					name === 'cancelAnimationFrame'
				) {
					const key = keyOf(node.arguments?.[0]);
					if (key !== null) result.cleared.add(key);
				} else if (name === 'removeEventListener') {
					result.removed.push({
						target: 'g:window',
						type: eventType(node.arguments?.[0]),
						handler: keyOf(node.arguments?.[1]),
						capture: captureOf(node.arguments?.[2]),
					});
				} else if (callee?.type === 'MemberExpression') {
					const method = memberName(callee);
					const object = keyOf(callee.object);
					if (method === 'abort') {
						const receiver = unwrap(callee.object);
						const controller =
							receiver?.type === 'Identifier' ? controllerOf(bindingOf(receiver)) : null;
						if (controller !== null) result.aborted.add(controller);
					} else if (method === 'removeEventListener' && object !== null) {
						result.removed.push({
							target: object,
							type: eventType(node.arguments?.[0]),
							handler: keyOf(node.arguments?.[1]),
							capture: captureOf(node.arguments?.[2]),
						});
					} else if (method === 'clearWatch' && object === 'g:navigator.geolocation') {
						const key = keyOf(node.arguments?.[0]);
						if (key !== null) result.cleared.add(key);
					} else if (
						(method === 'disconnect' || method === 'unobserve' || method === 'close') &&
						object !== null
					) {
						result.disposed.add(object);
					}
				}
			}
			for (const key in node) {
				if (!SKIP_KEYS.has(key) && !key.startsWith('_octane')) visit(node[key]);
			}
		};
		try {
			visit(FUNCTIONS.has(fn.type) ? fn.body : fn);
		} finally {
			frames = enclosingFrames;
			activeScans.delete(fn);
		}
		return result;
	}

	// Cleanup returned on any path counts. Paths that return none usually exit
	// before starting work; this is a bounded proof, not a path-sensitive one.
	function cleanupOf(record) {
		const result = emptyCleanup();
		record.cleanupFunctions.forEach((fn, index) => {
			mergeCleanup(result, scan(fn, null, record.cleanupFrames[index]));
		});
		return result;
	}

	function perRun(binding, record) {
		return binding?.scope != null && record.setupScopes.has(functionScopeOf(binding.scope));
	}

	function aborts(controller, cleanup, record) {
		return perRun(controller, record) && cleanup.aborted.has(controller);
	}

	function protectedWrite(write, cleanup, record) {
		for (let guard = write.guards; guard !== null; guard = guard.next) {
			const token = guard.token;
			if (token.segment !== write.segment) continue;
			if (token.controller) {
				if (!token.truthy && aborts(token.controller, cleanup, record)) return true;
				continue;
			}
			const values = cleanup.flags.get(token.binding);
			if (
				values !== undefined &&
				perRun(token.binding, record) &&
				[...values].every((value) => value !== UNKNOWN && value !== token.truthy)
			) {
				return true;
			}
		}
		for (const controller of write.controllers ?? []) {
			if (aborts(controller, cleanup, record)) return true;
		}
		return false;
	}

	// --- platform resources --------------------------------------------------

	function eventType(expression) {
		const value = staticValue(expression);
		return typeof value === 'string' ? value : UNKNOWN;
	}

	// A listener options argument, through stable aliases and the arguments of
	// the helpers being visited.
	function optionsOf(expression, depth = 0) {
		const node = unwrap(expression);
		if (node?.type !== 'Identifier' || depth > 8) return node;
		const binding = bindingOf(node);
		const source = binding == null ? null : (frameArgument(binding) ?? stableInit(binding));
		return source === null ? node : optionsOf(source, depth + 1);
	}

	function captureOf(expression) {
		const node = optionsOf(expression);
		if (node == null) return false;
		if (node.type === 'ObjectExpression') {
			let capture = false;
			for (const property of node.properties ?? []) {
				if (property.type !== 'Property') return UNKNOWN;
				if (property.computed || (property.key?.name ?? property.key?.value) !== 'capture') {
					continue;
				}
				const value = staticValue(property.value);
				capture = value === UNKNOWN ? UNKNOWN : Boolean(value);
			}
			return capture;
		}
		const value = staticValue(node);
		return value === UNKNOWN ? UNKNOWN : Boolean(value);
	}

	function listenerSignal(expression) {
		const node = optionsOf(expression);
		if (node?.type !== 'ObjectExpression') return null;
		for (const property of node.properties ?? []) {
			if (
				property.type === 'Property' &&
				(property.key?.name ?? property.key?.value) === 'signal'
			) {
				return signalController(property.value);
			}
		}
		return null;
	}

	function platformConstructor(expression) {
		const node = unwrap(expression);
		if (node?.type !== 'NewExpression') return null;
		const name = globalFunction(node.callee);
		return OBSERVERS.has(name) ? 'observer' : CLOSABLES.has(name) ? 'closable' : null;
	}

	// An EventTarget provided by the platform: browser globals and what they
	// return, elements held by refs attached to intrinsic elements, and
	// connections constructed here. A user object's addEventListener is not one.
	function platformTarget(expression, depth = 0) {
		const node = unwrap(expression);
		if (depth > 8 || node == null) return false;
		if (node.type === 'Identifier') {
			const binding = bindingOf(node);
			if (binding === null) return EVENT_TARGET_GLOBALS.has(node.name);
			if (binding === undefined) return false;
			const argument = frameArgument(binding);
			if (argument !== null) return platformTarget(argument, depth + 1);
			// A destructured property of a platform object is one too.
			const info = binding.reassigned ? null : declarator(binding);
			const init = info === null ? null : unwrap(info.decl.init);
			return init != null && platformTarget(init, depth + 1);
		}
		if (node.type === 'MemberExpression') {
			const object = unwrap(node.object);
			if (memberName(node) === 'current' && object?.type === 'Identifier') {
				return refs().host.has(refRoot(bindingOf(object)));
			}
			return platformTarget(node.object, depth + 1);
		}
		if (node.type === 'CallExpression') {
			const name = globalFunction(node.callee);
			if (name === 'matchMedia') return true;
			const callee = unwrap(node.callee);
			return callee?.type === 'MemberExpression' && platformTarget(callee.object, depth + 1);
		}
		return platformConstructor(node) !== null;
	}

	function ownerKey(node) {
		return refs().owners.get(node) ?? null;
	}

	function acquire(record, node) {
		const callee = unwrap(node.callee);
		const name = globalFunction(callee);
		if (name === 'setInterval') {
			record.acquisitions.push({ kind: 'interval', node, handle: ownerKey(node) });
			return;
		}
		if (name === 'setTimeout' || name === 'requestAnimationFrame') {
			const reschedules = rescheduleKeys(node, name);
			if (reschedules !== null) {
				record.acquisitions.push({ kind: 'loop', node, handle: ownerKey(node), reschedules });
			}
			return;
		}
		// The global addEventListener is the window's.
		const target =
			name === 'addEventListener'
				? 'g:window'
				: callee?.type === 'MemberExpression' &&
					  memberName(callee) === 'addEventListener' &&
					  platformTarget(callee.object)
					? keyOf(callee.object)
					: undefined;
		if (target !== undefined) {
			record.acquisitions.push({
				kind: 'listener',
				node,
				target,
				type: eventType(node.arguments?.[0]),
				handler: keyOf(node.arguments?.[1]),
				capture: captureOf(node.arguments?.[2]),
				signal: listenerSignal(node.arguments?.[2]),
			});
			return;
		}
		if (callee?.type !== 'MemberExpression') return;
		const method = memberName(callee);
		if (method === 'watchPosition' && keyOf(callee.object) === 'g:navigator.geolocation') {
			record.acquisitions.push({ kind: 'watch', node, handle: ownerKey(node) });
		}
	}

	function construct(record, node) {
		const kind = platformConstructor(node);
		if (kind !== null) record.acquisitions.push({ kind, node, handle: ownerKey(node) });
	}

	// `target.onresize = handler`, or the window's global `onresize = handler`,
	// installs a platform event handler property.
	function assign(record, node) {
		const left = unwrap(node.left);
		if (node.operator !== '=') return;
		const global = left?.type === 'Identifier' && bindingOf(left) === null;
		if (!global && left?.type !== 'MemberExpression') return;
		const name = global ? left.name : memberName(left);
		if (name === null || !/^on[a-z]+$/.test(name)) return;
		if (!global && !platformTarget(left.object)) return;
		if (staticValue(node.right) === null || staticValue(node.right) === undefined) return;
		record.acquisitions.push({
			kind: 'property',
			node: left,
			handle: keyOf(left),
			target: global ? 'g:window' : keyOf(left.object),
		});
	}

	// A timer callback that schedules itself again is an interval.
	function rescheduleKeys(node, name) {
		const callback = functionOf(node.arguments?.[0]);
		const self = unwrap(node.arguments?.[0]);
		if (callback === null || self?.type !== 'Identifier') return null;
		const binding = bindingOf(self);
		const keys = [];
		const visit = (value) => {
			if (value == null || typeof value !== 'object') return;
			if (Array.isArray(value)) {
				for (const child of value) visit(child);
				return;
			}
			if (FUNCTIONS.has(value.type)) return;
			if (value.type === 'CallExpression' && globalFunction(value.callee) === name) {
				const argument = unwrap(value.arguments?.[0]);
				if (argument?.type === 'Identifier' && bindingOf(argument) === binding) {
					keys.push(ownerKey(value));
				}
			}
			for (const key in value) {
				if (!SKIP_KEYS.has(key) && !key.startsWith('_octane')) visit(value[key]);
			}
		};
		visit(callback.body);
		return keys.length === 0 ? null : keys;
	}

	function released(acquisition, cleanup, record) {
		switch (acquisition.kind) {
			case 'listener':
				if (acquisition.signal !== null && aborts(acquisition.signal, cleanup, record)) return true;
				if (acquisition.target !== null && cleanup.disposed.has(acquisition.target)) return true;
				return (
					acquisition.handler !== null &&
					acquisition.target !== null &&
					cleanup.removed.some(
						(removal) =>
							removal.target === acquisition.target &&
							removal.handler === acquisition.handler &&
							(removal.type === UNKNOWN ||
								acquisition.type === UNKNOWN ||
								removal.type === acquisition.type) &&
							(removal.capture === UNKNOWN ||
								acquisition.capture === UNKNOWN ||
								removal.capture === acquisition.capture),
					)
				);
			case 'property':
				return (
					(acquisition.handle !== null && cleanup.properties.has(acquisition.handle)) ||
					(acquisition.target !== null && cleanup.disposed.has(acquisition.target))
				);
			case 'interval':
			case 'watch':
				return acquisition.handle !== null && cleanup.cleared.has(acquisition.handle);
			case 'loop':
				return (
					acquisition.handle !== null &&
					cleanup.cleared.has(acquisition.handle) &&
					acquisition.reschedules.every((key) => key === acquisition.handle)
				);
			default:
				return acquisition.handle !== null && cleanup.disposed.has(acquisition.handle);
		}
	}

	// --- ref provenance ------------------------------------------------------

	function refRoot(binding) {
		const info = refs();
		return info.aliases.get(binding) ?? binding;
	}

	// One module walk classifies every useRef binding: refs attached through a
	// `ref` attribute of an intrinsic element are host refs, and any use other
	// than a property access or a stable alias makes a ref an escaped instance.
	// It also records which declaration or assignment target owns a call result.
	function refs() {
		if (references !== null) return references;
		// Ownership keys must not depend on the call being visited.
		const enclosingFrames = frames;
		frames = null;
		try {
			return buildReferences();
		} finally {
			frames = enclosingFrames;
		}
	}

	function buildReferences() {
		references = {
			roots: new Set(),
			aliases: new Map(),
			declarations: new Map(),
			escaped: new Set(),
			host: new Set(),
			owners: new WeakMap(),
		};
		const { roots, aliases, declarations, owners } = references;
		const names = new Set();
		for (const { decl, bindings } of declarators) {
			const init = unwrap(decl.init);
			const binding = bindings[0]?.binding;
			if (decl.id?.type === 'Identifier' && binding && !binding.reassigned) {
				if (init?.type === 'CallExpression' && callNames.get(init) === 'useRef') {
					roots.add(binding);
					declarations.set(decl.id, binding);
					names.add(binding.name);
				}
			}
			if (decl.id?.type === 'Identifier' && binding && init != null) {
				owners.set(init, `b${binding.id}`);
			}
		}
		// Stable aliases share their root's classification.
		for (let changed = roots.size !== 0; changed;) {
			changed = false;
			for (const { decl, bindings } of declarators) {
				const init = unwrap(decl.init);
				const binding = bindings[0]?.binding;
				if (
					decl.id?.type !== 'Identifier' ||
					!binding ||
					binding.reassigned ||
					aliases.has(binding) ||
					roots.has(binding) ||
					init?.type !== 'Identifier'
				) {
					continue;
				}
				const target = bindingOf(init);
				const root = target && (aliases.get(target) ?? (roots.has(target) ? target : null));
				if (root) {
					aliases.set(binding, root);
					declarations.set(decl.id, root);
					names.add(binding.name);
					changed = true;
				}
			}
		}
		const parents = [];
		const visit = (node) => {
			if (node == null || typeof node !== 'object') return;
			if (Array.isArray(node)) {
				for (const child of node) visit(child);
				return;
			}
			if (node.type === 'AssignmentExpression' && node.operator === '=') {
				const key = keyOf(node.left);
				if (key !== null) owners.set(unwrap(node.right), key);
			}
			if (node.type === 'Identifier' && names.has(node.name)) classify(node, parents);
			parents.push(node);
			for (const key in node) {
				if (!SKIP_KEYS.has(key) && !key.startsWith('_octane')) visit(node[key]);
			}
			parents.pop();
		};
		visit(ast);
		return references;
	}

	function classify(identifier, parents) {
		const binding = bindingOf(identifier);
		if (!binding) return;
		const root =
			references.aliases.get(binding) ?? (references.roots.has(binding) ? binding : null);
		if (root === null) return;
		let child = identifier;
		let index = parents.length - 1;
		while (index >= 0 && TRANSPARENT.has(parents[index].type)) child = parents[index--];
		const parent = parents[index];
		if (parent === undefined) return;
		switch (parent.type) {
			case 'MemberExpression':
				// Reading or writing a property does not share the ref object.
				if (parent.object === child || (parent.property === child && !parent.computed)) return;
				break;
			case 'Property':
			case 'MethodDefinition':
			case 'PropertyDefinition':
				if (parent.key === child && !parent.computed && parent.shorthand !== true) return;
				break;
			case 'VariableDeclarator':
				// A stable alias is classified with its root; destructuring reads properties.
				if (parent.id === child || parent.id?.type === 'ObjectPattern') return;
				if (references.declarations.has(parent.id)) return;
				break;
			case 'LabeledStatement':
			case 'BreakStatement':
			case 'ContinueStatement':
				return;
			case 'ArrayExpression': {
				// A dependency list is not a use of the ref's identity, even when it
				// is parenthesized or cast.
				let list = parent;
				let at = index - 1;
				while (at >= 0 && TRANSPARENT.has(parents[at].type)) list = parents[at--];
				const call = parents[at];
				const position = DEPENDENCY_ARGUMENTS.get(callNames.get(call));
				if (position !== undefined && call.arguments?.[position] === list) return;
			}
			// falls through
			case 'JSXExpressionContainer': {
				let attribute = parents[index - 1];
				let element = parents[index - 2];
				if (parent.type === 'ArrayExpression') {
					attribute = parents[index - 2];
					element = parents[index - 3];
					if (parents[index - 1]?.type !== 'JSXExpressionContainer') attribute = null;
				}
				if (attribute?.type === 'JSXAttribute' && attribute.name?.name === 'ref') {
					const name = element?.type === 'JSXOpeningElement' ? element.name : null;
					if (name?.type === 'JSXIdentifier' && /^[a-z]/.test(name.name)) {
						references.host.add(root);
					}
				}
				break;
			}
		}
		references.escaped.add(root);
	}

	return {
		// Effect lifecycle state. Guards are structured; the flow segment and its
		// abort proof change at yields, join at branches, and restore per function.
		enterEffect(record) {
			record.continuations = [];
			record.acquisitions = [];
			record.cleanupFunctions = [];
			record.cleanupFrames = [];
			record.opaqueCleanup = false;
			record.setupScopes = new Set();
			const saved = { flow, guards };
			flow = { segment: ++segments, controllers: null };
			guards = null;
			return saved;
		},
		exitEffect(saved) {
			flow = saved.flow;
			guards = saved.guards;
		},
		saveFlow() {
			return flow;
		},
		restoreFlow(saved) {
			flow = saved;
		},
		joinFlow,
		// A loop body that yields may start after its previous iteration's yield.
		enterLoopBody(body) {
			if (containsAwait(body)) continue_(null);
		},
		saveGuards() {
			return guards;
		},
		restoreGuards(saved) {
			guards = saved;
		},
		guard: pushGuard,
		statementGuard,
		enterCall(fn, args) {
			const saved = frames;
			frames = { parameters: parametersOf(fn), args, next: frames };
			return saved;
		},
		exitCall(saved) {
			frames = saved;
		},
		setupFunction(record, node) {
			const scope = analysis.functionScopes.get(node);
			if (scope !== undefined) record.setupScopes.add(scope);
		},
		// A promise callback or an await resumes in a later task.
		continuation(expression) {
			continue_(expression);
		},
		continuationWrite(record, origin) {
			record.continuations.push({
				origin,
				guards,
				segment: flow.segment,
				controllers: flow.controllers,
			});
		},
		// A cleanup returned through local helper calls closes over their
		// parameters, so it is scanned with each call's arguments.
		cleanup(record, callbacks) {
			if (callbacks === null) {
				record.opaqueCleanup = true;
				return;
			}
			for (const callback of callbacks) {
				const owners = callback.owners ?? [];
				let outer = owners.length === 0 ? null : frames;
				for (let index = owners.length - 1; index >= 0; index--) {
					const { call, fn } = owners[index];
					const args = call.arguments?.some((argument) => argument.type === 'SpreadElement')
						? null
						: call.arguments;
					outer = { parameters: parametersOf(fn), args, next: outer };
				}
				record.cleanupFunctions.push(callback.node);
				record.cleanupFrames.push(outer);
			}
		},
		acquire,
		construct,
		assign,
		finishEffect(record, asyncCallback) {
			if (record.continuations.length === 0 && record.acquisitions.length === 0) return;
			const cleanup = cleanupOf(record);
			const hasCleanup = record.cleanupFunctions.length !== 0 || record.opaqueCleanup;
			for (const write of record.continuations) {
				if (protectedWrite(write, cleanup, record)) continue;
				report(
					STRONG_EFFECT_DATA_FETCH,
					write.origin,
					FETCH_MESSAGES[asyncCallback ? 'async' : hasCleanup ? 'ineffective' : 'missing'],
				);
			}
			for (const acquisition of record.acquisitions) {
				if (released(acquisition, cleanup, record)) continue;
				report(STRONG_EFFECT_RESOURCE_LEAK, acquisition.node, LEAK_MESSAGES[acquisition.kind]);
			}
		},
		// Callbacks of these calls run before the browser paints, so an update
		// inside them is as synchronous as one in effect setup. 'sync' runs the
		// callback immediately; 'yield' runs it after pending microtasks.
		runsBeforePaint(node) {
			if (callNames.get(node) === 'startTransition') return 'sync';
			const callee = unwrap(node.callee);
			const name = globalFunction(callee);
			if (name === 'queueMicrotask') return 'yield';
			if (name === 'setTimeout') {
				const handler = unwrap(node.arguments?.[0]);
				return handler != null &&
					handler.type !== 'SpreadElement' &&
					node.arguments?.[1]?.type !== 'SpreadElement' &&
					typeof staticValue(handler) !== 'string' &&
					zeroDelay(node.arguments?.[1])
					? 'yield'
					: false;
			}
			return callee?.type === 'MemberExpression' &&
				CONTINUATIONS.has(memberName(callee)) &&
				maySettlePromise(callee.object)
				? 'yield'
				: false;
		},
		// Awaiting the argument may resume before the next paint.
		zeroDelayAwait(argument) {
			return maySettle(argument);
		},
		// A useRef whose identity never leaves property accesses and stable
		// aliases holds a plain value, not an attached element or instance.
		isValueRef(declaration) {
			const info = refs();
			const root = info.declarations.get(declaration);
			return root !== undefined && !info.escaped.has(root);
		},
		hiddenDependency(node, kind) {
			report(STRONG_EFFECT_HIDDEN_DEPENDENCY, node, HIDDEN_MESSAGES[kind]);
		},
		// The stable initializer of a binding declared in the function that reads
		// it: that initializer ran earlier on the same path.
		localInit(expression) {
			const node = unwrap(expression);
			if (node?.type !== 'Identifier') return null;
			const scope = nodeScopes.get(node);
			const binding = bindingOf(node);
			if (scope === undefined || binding == null || binding.scope == null) return null;
			return functionScopeOf(binding.scope) === functionScopeOf(scope) ? stableInit(binding) : null;
		},
		// A provably known operand value, as `{ value }`, or null.
		literal(expression) {
			const value = staticValue(expression);
			return value === UNKNOWN ? null : { value };
		},
		selected,
	};
}
