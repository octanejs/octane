// Strong effect lifecycle proofs. The Strong visitor owns execution phases and
// state provenance; this policy owns the questions it asks about effect setup:
// which platform calls run their callback before the next paint, and whether
// an asynchronous state update is cancelled or ignored by the returned cleanup.
// Identity comes from the shared lexical analysis, never from spelling. Nothing
// here annotates the parser tree or changes emitted code.

export const STRONG_EFFECT_DATA_FETCH = 'OCTANE_STRONG_EFFECT_DATA_FETCH';

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
const UNKNOWN = Symbol('unknown');

const FETCH_MESSAGES = {
	missing:
		'Strong mode requires cleanup for a state update that runs after an await or promise callback in an effect. Read asynchronous render data with use() or a query binding. For external synchronization, pass an AbortController signal to the request and abort it in the returned cleanup, or set a flag in the cleanup and check it before this update.',
	async:
		'Strong mode requires cleanup for a state update that runs after an await in an effect, but an async effect callback returns a promise instead of cleanup. Read asynchronous render data with use() or a query binding, or start the async work inside a synchronous effect whose returned cleanup aborts it or sets a flag checked before this update.',
	ineffective:
		'Strong mode requires the effect cleanup to cancel or ignore this asynchronous state update, but the returned cleanup does neither. Abort an AbortController whose signal is passed to the request, or set a flag in the cleanup and check it before this update, after the last await.',
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
	let flow = { segment: 0, controllers: null };
	let guards = null;
	let segments = 0;
	// Arguments of the local calls being visited, so a signal passed to a helper
	// parameter still identifies its AbortController.
	let frames = null;
	let parameterLists = null;
	const scans = new WeakMap();

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
			if (!binding.reassigned && depth < 8) {
				const info = declarator(binding);
				const init = info === null ? null : unwrap(info.decl.init);
				if (init?.type === 'Identifier' || init?.type === 'MemberExpression') {
					const base = keyOf(init, depth + 1);
					if (base !== null) return info.path.length === 0 ? base : memberKey(base, info.path[0]);
				}
			}
			return `b${binding.id}`;
		}
		if (node?.type === 'MemberExpression') {
			const property = memberName(node);
			const object = property === null ? null : keyOf(node.object, depth);
			return object === null ? null : memberKey(object, property);
		}
		return null;
	}

	// A property of the global object names the global itself, whether it is
	// read as `window.name` or destructured as `const { name } = window`.
	function memberKey(object, property) {
		if (object === 'g:window') return GLOBAL_OBJECTS.has(property) ? object : `g:${property}`;
		return `${object}.${property}`;
	}

	function staticValue(expression, depth = 0) {
		const node = unwrap(expression);
		if (node?.type === 'Literal') return node.value;
		if (node?.type === 'Identifier') {
			if (node.name === 'undefined' && bindingOf(node) === null) return undefined;
			return depth < 8 ? staticValue(stableInitOf(node), depth + 1) : UNKNOWN;
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
				const binding = bindingOf(node);
				if (node.name === 'undefined' && binding === null) return true;
				if (binding != null && !varInitialized(binding, node)) return true;
				const init = depth < 8 ? stableInitOf(node) : null;
				return init !== null && maySettle(init, depth + 1);
			}
			case 'SequenceExpression':
				return maySettle(node.expressions?.at(-1), depth);
			case 'ConditionalExpression':
				return someResult(node, maySettle, depth);
			case 'LogicalExpression':
				// A falsy left operand of `&&` is the value, and it is never a thenable.
				return (
					(node.operator === '&&' && selected(node) === null) || someResult(node, maySettle, depth)
				);
			case 'CallExpression':
				return settledPromise(node);
			default:
				return false;
		}
	}

	// Where a `var` declarator has run on every path: the rest of the statement
	// list that holds it, the body of a loop whose head declares it, or the rest
	// of a `for` statement whose initializer does. Module code finishes before
	// any component runs. Elsewhere a hoisted `var` may still be undefined.
	let varRegions = null;
	function varInitialized(binding, reference) {
		const info = declarator(binding);
		if (info?.kind !== 'var') return true;
		if (varRegions === null) {
			varRegions = new Map();
			const mark = (statement, start, end) => {
				// `export var` declares in the module like a bare `var`.
				const declaration =
					statement?.type === 'ExportNamedDeclaration' ? statement.declaration : statement;
				if (declaration?.type !== 'VariableDeclaration' || declaration.kind !== 'var') return;
				for (const decl of declaration.declarations ?? []) {
					varRegions.set(decl, [start ?? decl.end, end]);
				}
			};
			const visit = (node) => {
				if (node == null || typeof node !== 'object') return;
				if (Array.isArray(node)) {
					for (const child of node) visit(child);
					return;
				}
				const list =
					node.type === 'SwitchCase'
						? node.consequent
						: Array.isArray(node.body)
							? node.body
							: null;
				if (list !== null) {
					for (const statement of list) {
						mark(statement, node.type === 'Program' ? node.start : null, node.end);
					}
				}
				if (node.type === 'ForInStatement' || node.type === 'ForOfStatement') {
					mark(node.left, node.body?.start, node.body?.end);
				} else if (node.type === 'ForStatement') {
					mark(node.init, null, node.end);
				}
				for (const key in node) {
					if (!SKIP_KEYS.has(key) && !key.startsWith('_octane')) visit(node[key]);
				}
			};
			visit(ast);
		}
		const region = varRegions.get(info.decl);
		return region !== undefined && reference.start >= region[0] && reference.end <= region[1];
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

	function parametersOf(fn) {
		if (parameterLists === null) {
			parameterLists = new Map();
			for (const record of functions) parameterLists.set(record.node, record.parameters ?? []);
		}
		return parameterLists.get(fn) ?? [];
	}

	// A controller a cleanup aborts, or a parameter of `fn` that each call maps
	// to its own argument.
	function abortTarget(expression, fn) {
		const node = unwrap(expression);
		const binding = node?.type === 'Identifier' ? bindingOf(node) : null;
		return (
			controllerOf(binding) ??
			(binding != null && parametersOf(fn).includes(binding) ? binding : null)
		);
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
			case 'LogicalExpression': {
				// A known test or left operand leaves only the operand it selects.
				const only = selected(node);
				if (only !== null) return requestControllers(only, depth + 1);
				return node.type === 'ConditionalExpression'
					? sharedControllers(
							requestControllers(node.consequent, depth + 1),
							requestControllers(node.alternate, depth + 1),
						)
					: sharedControllers(
							requestControllers(node.left, depth + 1),
							requestControllers(node.right, depth + 1),
						);
			}
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

	// What a cleanup does synchronously: flags it assigns and controllers it aborts.
	function emptyCleanup() {
		return { flags: new Map(), aborted: new Set() };
	}

	// `call` maps the parameters a helper aborted to the arguments of one call.
	function mergeCleanup(result, child, call = null) {
		for (const [binding, values] of child.flags) {
			let target = result.flags.get(binding);
			if (target === undefined) result.flags.set(binding, (target = new Set()));
			for (const value of values) target.add(value);
		}
		for (const value of child.aborted) {
			const index = call === null ? -1 : parametersOf(call.callee).indexOf(value);
			const target = index === -1 ? value : abortTarget(call.args?.[index], call.caller);
			if (target !== null) result.aborted.add(target);
		}
	}

	function scan(fn) {
		let result = scans.get(fn);
		if (result !== undefined) return result;
		result = emptyCleanup();
		// Cache first: a cleanup helper cycle then sees a partial result.
		scans.set(fn, result);
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
					}
				}
			} else if (node.type === 'CallExpression') {
				const callee = unwrap(node.callee);
				const inline = functionOf(callee);
				if (inline !== null && inline !== fn && inline.async !== true && !inline.generator) {
					const args = node.arguments?.some((argument) => argument.type === 'SpreadElement')
						? null
						: node.arguments;
					mergeCleanup(result, scan(inline), { callee: inline, args, caller: fn });
				}
				if (callee?.type === 'MemberExpression' && memberName(callee) === 'abort') {
					const target = abortTarget(callee.object, fn);
					if (target !== null) result.aborted.add(target);
				}
			}
			for (const key in node) {
				if (!SKIP_KEYS.has(key) && !key.startsWith('_octane')) visit(node[key]);
			}
		};
		visit(FUNCTIONS.has(fn.type) ? fn.body : fn);
		return result;
	}

	// Cleanup returned on any path counts. Paths that return none usually exit
	// before starting work; this is a bounded proof, not a path-sensitive one.
	function cleanupOf(record) {
		const result = emptyCleanup();
		for (const fn of record.cleanupFunctions) mergeCleanup(result, scan(fn));
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

	return {
		// Effect lifecycle state. Guards are structured; the flow segment and its
		// abort proof change at yields, join at branches, and restore per function.
		enterEffect(record) {
			record.continuations = [];
			record.cleanupFunctions = [];
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
		cleanup(record, callbacks) {
			if (callbacks === null) {
				record.opaqueCleanup = true;
				return;
			}
			for (const callback of callbacks) record.cleanupFunctions.push(callback);
		},
		finishEffect(record, asyncCallback) {
			if (record.continuations.length === 0) return;
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
		// The stable initializer of a binding declared in the function that reads
		// it, once that initializer has run on every path to the read: a `const`
		// or `let` by its temporal dead zone, and a hoisted `var` inside the region
		// where its declaration has run.
		localInit(expression) {
			const node = unwrap(expression);
			if (node?.type !== 'Identifier') return null;
			const scope = nodeScopes.get(node);
			const binding = bindingOf(node);
			if (scope === undefined || binding == null || binding.scope == null) return null;
			const kind = declarator(binding)?.kind;
			if (kind !== 'const' && kind !== 'let' && kind !== 'var') return null;
			if (functionScopeOf(binding.scope) !== functionScopeOf(scope)) return null;
			return varInitialized(binding, node) ? stableInit(binding) : null;
		},
		// A provably known operand value, as `{ value }`, or null.
		literal(expression) {
			const value = staticValue(expression);
			return value === UNKNOWN ? null : { value };
		},
		selected,
	};
}
