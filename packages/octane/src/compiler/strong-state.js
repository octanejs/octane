// Strong state purity checks that share the Strong visitor's lexical bindings
// and execution phases: pure updaters and reducers, immutable state values in
// every phase, and deferred updates computed from a stale render snapshot.
// Like the other Strong policies, this never annotates the parser tree or
// changes the code emitted for a valid module.

export const STRONG_IMPURE_UPDATER = 'OCTANE_STRONG_IMPURE_UPDATER';
export const STRONG_SNAPSHOT_MUTATION = 'OCTANE_STRONG_SNAPSHOT_MUTATION';
export const STRONG_STALE_STATE_UPDATE = 'OCTANE_STRONG_STALE_STATE_UPDATE';

const FUNCTIONS = new Set(['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression']);
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
const TIMER_GLOBALS = new Set([
	'setTimeout',
	'setInterval',
	'requestAnimationFrame',
	'requestIdleCallback',
	'queueMicrotask',
]);
const PROMISE_CONTINUATIONS = new Set(['then', 'catch', 'finally']);
const ARRAY_MUTATORS = new Set([
	'copyWithin',
	'fill',
	'pop',
	'push',
	'reverse',
	'shift',
	'sort',
	'splice',
	'unshift',
]);
const COLLECTION_MUTATORS = new Map([
	['Map', new Set(['set', 'delete', 'clear'])],
	['Set', new Set(['add', 'delete', 'clear'])],
]);
const MUTATOR_METHODS = new Set([...ARRAY_MUTATORS, 'set', 'add', 'delete', 'clear']);
// The first argument is written in place. `Object`/`Reflect` must be the
// unshadowed standard globals for this to be a proof.
const TARGET_MUTATORS = new Map([
	['Object', new Set(['assign', 'defineProperty', 'defineProperties', 'setPrototypeOf'])],
	['Reflect', new Set(['set', 'deleteProperty', 'defineProperty', 'setPrototypeOf'])],
]);

const REPLAY =
	'Octane may call updaters and reducers more than once, for example to replay them over a held transition.';
const IMPURE_MESSAGES = new Map([
	[
		'OCTANE_STRONG_RENDER_IMPURE_CALL',
		`Strong mode does not allow nondeterministic calls in a state updater or reducer. ${REPLAY} Read the time or random value in the event handler and pass it in, for example: const now = Date.now(); setValue((current) => current + now).`,
	],
	[
		'OCTANE_STRONG_RENDER_AMBIENT_READ',
		`Strong mode does not allow reading browser globals in a state updater or reducer. ${REPLAY} Read the browser value in the event handler and pass it in.`,
	],
	[
		'OCTANE_STRONG_RENDER_STATE_UPDATE',
		`Strong mode does not allow state updates in a state updater or reducer. ${REPLAY} Call each setter from the event handler, or keep values that change together in one state or reducer.`,
	],
	[
		'OCTANE_STRONG_RENDER_STATE_GETTER_CALL',
		`Strong mode does not allow calling a state getter in a state updater or reducer. ${REPLAY} Call the getter in the event handler and pass the value in.`,
	],
	[
		'OCTANE_STRONG_RENDER_MODULE_STATE_READ',
		`Strong mode does not allow reading a reassigned module variable in a state updater or reducer. ${REPLAY} Read it in the event handler and pass the value in, or keep it in state.`,
	],
	[
		'OCTANE_STRONG_RENDER_REF_READ',
		`Strong mode does not allow reading useRef.current in a state updater or reducer. ${REPLAY} Read the ref in the event handler and pass the value in.`,
	],
	[
		'OCTANE_STRONG_RENDER_REF_WRITE',
		`Strong mode does not allow writing useRef.current in a state updater or reducer. ${REPLAY} Write the ref in the event handler or an effect.`,
	],
	[
		'OCTANE_STRONG_RENDER_EFFECT_EVENT_CALL',
		`Strong mode does not allow calling an Effect Event in a state updater or reducer. ${REPLAY} Call it from the event handler or an effect.`,
	],
]);
const FETCH_MESSAGE = `Strong mode does not allow fetch in a state updater or reducer. ${REPLAY} Start the request in the event handler or an Action, then pass its result to the setter.`;
const SCHEDULE_MESSAGE = `Strong mode does not allow scheduling work in a state updater or reducer. ${REPLAY} Schedule timers, microtasks, and promise callbacks from the event handler or an effect.`;
const UPDATER_MUTATION_MESSAGE = `Strong mode does not allow a state updater or reducer to mutate the state it receives. ${REPLAY} Return a new value instead, for example (current) => [...current, item].`;
export const SNAPSHOT_MUTATION_MESSAGE =
	'Strong mode does not allow mutating a state value outside render. Passing the same object back to its setter does not re-render, and the change rewrites the snapshot that transitions and useOptimistic revert to. Pass a new value instead, for example setItems([...items, item]) or setItems((current) => [...current, item]). Keep mutable objects in useRef.';
const STALE_MESSAGE =
	'Strong mode does not allow a deferred state update computed from the render snapshot of the same state. After an await, or in a timer or promise callback, other updates may already have changed it. Use the updater form, setValue((current) => current + 1), or read the latest value with the state getter (the third tuple member).';
const STALE_REDUCER_MESSAGE =
	'Strong mode does not allow a deferred dispatch computed from the render snapshot of the same reducer state. After an await, or in a timer or promise callback, other actions may already have changed it. Compute the next state in the reducer from the state it receives, or read the latest value with the state getter (the third tuple member).';

/**
 * @param {{
 *   report: (code: string, node: any, message: string) => void,
 *   resolve: (scope: any, name: string) => any,
 *   unwrap: (node: any) => any,
 *   createScope: (parent: any, kind: string, statements?: any[], params?: any[]) => any,
 *   snapshotBinding: (node: any, scope: any) => any,
 *   callableValue: (node: any, scope: any) => any,
 *   staticPrimitiveValue: (node: any, scope: any) => any,
 *   ambientPropertyKey: (node: any, scope: any) => any,
 *   isGlobalObject: (node: any, scope: any) => boolean,
 *   fetchFunction: (node: any, scope: any) => boolean,
 *   hookOf: (call: any) => string | null,
 * }} api
 */
export function createStrongStatePolicy(api) {
	const {
		report,
		resolve,
		unwrap,
		createScope,
		snapshotBinding,
		callableValue,
		staticPrimitiveValue,
		ambientPropertyKey,
		isGlobalObject,
		fetchFunction,
		hookOf,
	} = api;
	const asynchronousCallbacks = new WeakSet();
	let freshCaptures = false;

	function unshadowed(node, scope, names) {
		const value = unwrap(node);
		return value?.type === 'Identifier' &&
			names.has(value.name) &&
			resolve(scope, value.name) === null
			? value.name
			: null;
	}

	// Timers and promise continuations run after the current task. Other
	// callbacks have an unknown invocation time and stay synchronous callbacks.
	function isAsynchronousCall(callee, scope) {
		const node = unwrap(callee);
		if (unshadowed(node, scope, TIMER_GLOBALS) !== null) return true;
		if (node?.type !== 'MemberExpression') return false;
		const key = ambientPropertyKey(node, scope);
		return (
			PROMISE_CONTINUATIONS.has(key) ||
			(TIMER_GLOBALS.has(key) && isGlobalObject(node.object, scope))
		);
	}

	function setterValues(value) {
		if (value?.kind === 'setter') return value.state ? [value] : [];
		if (value?.kind === 'callback-choice') return value.values.flatMap(setterValues);
		return [];
	}

	function literalShape(node, scope) {
		const value = unwrap(node);
		if (value?.type === 'ArrayExpression' || value?.type === 'ObjectExpression') {
			return { node: value, scope };
		}
		if (value?.type === 'NewExpression' && unshadowed(value.callee, scope, SHAPE_CONSTRUCTORS)) {
			return { node: value, scope };
		}
		return null;
	}

	// A lazy initializer or linked-state reconciler that returns a literal.
	function returnedShape(fn, scope) {
		const body = fn.body;
		if (body?.type !== 'BlockStatement') return literalShape(body, scope);
		return body.body?.length === 1 && body.body[0].type === 'ReturnStatement'
			? literalShape(body.body[0].argument, scope)
			: null;
	}

	function shapeKind(shape) {
		const node = shape?.node;
		if (node?.type === 'ArrayExpression') return 'array';
		if (node?.type === 'NewExpression') {
			const name = unwrap(node.callee).name;
			return name === 'Array' ? 'array' : name;
		}
		return node?.type === 'ObjectExpression' ? 'object' : null;
	}

	function propertyKey(property, scope) {
		if (property.computed) return staticPrimitiveValue(property.key, scope);
		return property.key?.type === 'Identifier' ? property.key.name : property.key?.value;
	}

	return {
		/** Mark inline callbacks of a timer or promise continuation before they are visited. */
		enterCall(node, callee, scope) {
			if (!isAsynchronousCall(callee, scope)) return false;
			for (const argument of node.arguments ?? []) {
				const value = unwrap(argument);
				if (FUNCTIONS.has(value?.type)) asynchronousCallbacks.add(value);
			}
			return true;
		},

		isAsynchronousCallback(node) {
			return asynchronousCallbacks.has(node);
		},

		/** Setters whose single argument may be an updater function. */
		updaterSetters(callee, scope) {
			return setterValues(callableValue(callee, scope)).filter((setter) => {
				const hook = hookOf(setter.state);
				return hook === 'useState' || hook === 'useLinkedState';
			});
		},

		/** The Strong diagnostic that replaces a render diagnostic inside an updater or reducer. */
		pureDiagnostic(code) {
			if (code === 'OCTANE_STRONG_RENDER_SNAPSHOT_MUTATION') {
				return { code: STRONG_SNAPSHOT_MUTATION, message: UPDATER_MUTATION_MESSAGE };
			}
			const message = IMPURE_MESSAGES.get(code);
			return message === undefined ? null : { code: STRONG_IMPURE_UPDATER, message };
		},

		/** Report provable side effects that the render checks do not cover. */
		checkPureCall(callee, scope) {
			if (fetchFunction(callee, scope))
				report(STRONG_IMPURE_UPDATER, unwrap(callee), FETCH_MESSAGE);
			else if (isAsynchronousCall(callee, scope)) {
				report(STRONG_IMPURE_UPDATER, unwrap(callee), SCHEDULE_MESSAGE);
			}
		},

		/**
		 * State initialized with a literal keeps that literal as a structural
		 * proof for known mutator methods, including nested literal properties.
		 */
		initialShape(hook, node, scope) {
			if (hook === 'useState') {
				const initial = unwrap(node.arguments?.[0]);
				return FUNCTIONS.has(initial?.type)
					? returnedShape(initial, scope)
					: literalShape(initial, scope);
			}
			if (hook === 'useReducer' && node.arguments?.length === 2) {
				return literalShape(node.arguments[1], scope);
			}
			if (hook === 'useLinkedState') {
				const reconcile = unwrap(node.arguments?.[1]);
				return FUNCTIONS.has(reconcile?.type) ? returnedShape(reconcile, scope) : null;
			}
			return null;
		},

		memberShape(shape, key) {
			if (shape?.node.type !== 'ObjectExpression') return null;
			const properties = shape.node.properties ?? [];
			for (let index = properties.length - 1; index >= 0; index--) {
				const property = properties[index];
				// A later spread may replace the property.
				if (property.type !== 'Property') return null;
				if (propertyKey(property, shape.scope) === key) {
					return property.kind !== 'init' || property.method === true
						? null
						: literalShape(property.value, shape.scope);
				}
			}
			return null;
		},

		shapeIsArray(shape) {
			return shapeKind(shape) === 'array';
		},

		/** The node naming a provable in-place write to a state value, or null. */
		snapshotMutation(callee, args, scope) {
			const member = unwrap(callee);
			if (member?.type !== 'MemberExpression') return null;
			const method = member.computed
				? staticPrimitiveValue(member.property, scope)
				: member.property?.name;
			const receiver = unwrapIdentifierName(unwrap(member.object));
			const targets = TARGET_MUTATORS.get(receiver);
			if (targets?.has(method) && resolve(scope, receiver) === null) {
				return args?.[0] != null && snapshotBinding(args[0], scope) !== null ? member : null;
			}
			if (!MUTATOR_METHODS.has(method)) return null;
			const snapshot = snapshotBinding(member.object, scope);
			if (snapshot === null) return null;
			const kind = snapshot.array === true ? 'array' : shapeKind(snapshot.shape);
			if (kind === 'array') return ARRAY_MUTATORS.has(method) ? member : null;
			return COLLECTION_MUTATORS.get(kind)?.has(method) ? member : null;
		},

		/** Report a deferred setter or dispatch computed from its own render snapshot. */
		checkStaleUpdate(callee, args, scope, insideEffectEvent = false) {
			freshCaptures = insideEffectEvent;
			try {
				for (const setter of setterValues(callableValue(callee, scope))) {
					for (const argument of args ?? []) {
						const read = readsState(argument, scope, setter.state, new Set());
						if (read === null) continue;
						report(
							STRONG_STALE_STATE_UPDATE,
							read,
							hookOf(setter.state) === 'useReducer' ? STALE_REDUCER_MESSAGE : STALE_MESSAGE,
						);
						break;
					}
				}
			} finally {
				freshCaptures = false;
			}
		},
	};

	// Inside an Effect Event invocation, captured state is the latest committed
	// value; only a snapshot tagged stale by a deferred caller is reported, and a
	// local derived there is stale only through such an input.
	function readsBinding(binding, state, active) {
		if (binding?.kind === 'snapshot') {
			return binding.state === state && (!freshCaptures || binding.stale === true);
		}
		if (binding?.kind === 'derived-state') {
			if (!binding.states.has(state)) return false;
			if (!freshCaptures || binding.stale === true) return true;
			if (binding.init == null || active.has(binding)) return false;
			active.add(binding);
			try {
				return readsState(binding.init, binding.scope, state, active) !== null;
			} finally {
				active.delete(binding);
			}
		}
		// Calling or passing a local closure evaluates its captured snapshot reads.
		if (binding?.kind === 'callback-choice') {
			return binding.values.some((value) => readsBinding(value, state, active));
		}
		return (
			binding?.kind === 'callback' &&
			readsFunction(binding.node, binding.scope, state, active) !== null
		);
	}

	function readsFunction(fn, scope, state, active) {
		if (active.has(fn)) return null;
		active.add(fn);
		try {
			const body = fn.body;
			const block = body?.type === 'BlockStatement' || body?.type === 'JSXCodeBlock';
			const inner = createScope(scope, 'function', block ? body.body : [], fn.params ?? []);
			if (fn.type === 'FunctionExpression' && fn.id?.name) {
				inner.bindings.set(fn.id.name, { kind: 'other' });
			}
			for (const parameter of fn.params ?? []) {
				const read = readsPatternDefaults(parameter, inner, state, active);
				if (read !== null) return read;
			}
			return (
				readsState(block ? body.body : body, inner, state, active) ??
				(block ? readsState(body.render, inner, state, active) : null)
			);
		} finally {
			active.delete(fn);
		}
	}

	function readsPatternDefaults(pattern, scope, state, active) {
		if (pattern?.type === 'AssignmentPattern') {
			return (
				readsState(pattern.right, scope, state, active) ??
				readsPatternDefaults(pattern.left, scope, state, active)
			);
		}
		if (pattern?.type === 'ObjectPattern') {
			for (const property of pattern.properties ?? []) {
				const read =
					(property.computed ? readsState(property.key, scope, state, active) : null) ??
					readsPatternDefaults(property.value ?? property.argument, scope, state, active);
				if (read !== null) return read;
			}
			return null;
		}
		if (pattern?.type === 'ArrayPattern') {
			for (const element of pattern.elements ?? []) {
				const read = readsPatternDefaults(element, scope, state, active);
				if (read !== null) return read;
			}
			return null;
		}
		return pattern?.type === 'RestElement'
			? readsPatternDefaults(pattern.argument, scope, state, active)
			: null;
	}

	// The first expression in `node` that reads the render snapshot of `state`,
	// including through derived locals and the bodies of local closures.
	function readsState(value, scope, state, active) {
		if (value == null || typeof value !== 'object') return null;
		if (Array.isArray(value)) {
			for (const child of value) {
				const read = readsState(child, scope, state, active);
				if (read !== null) return read;
			}
			return null;
		}
		const node = unwrap(value);
		if (node == null || node.type?.startsWith('TS')) return null;
		switch (node.type) {
			case 'Identifier':
				return readsBinding(resolve(scope, node.name), state, active) ? node : null;
			case 'MemberExpression': {
				const snapshot = snapshotBinding(node, scope);
				if (snapshot?.state === state && (!freshCaptures || snapshot.stale === true)) {
					return node;
				}
				return (
					readsState(node.object, scope, state, active) ??
					(node.computed ? readsState(node.property, scope, state, active) : null)
				);
			}
			case 'Property':
				return (
					(node.computed ? readsState(node.key, scope, state, active) : null) ??
					readsState(node.value, scope, state, active)
				);
			case 'FunctionExpression':
			case 'ArrowFunctionExpression':
			case 'FunctionDeclaration':
				return readsFunction(node, scope, state, active);
			case 'BlockStatement':
				return readsState(node.body, createScope(scope, 'block', node.body), state, active);
			case 'CatchClause':
				return readsState(
					node.body,
					createScope(scope, 'block', [], node.param ? [node.param] : []),
					state,
					active,
				);
			case 'ForStatement':
			case 'ForInStatement':
			case 'ForOfStatement': {
				const declaration = node.type === 'ForStatement' ? node.init : node.left;
				const loop = createScope(
					scope,
					'block',
					declaration?.type === 'VariableDeclaration' ? [declaration] : [],
				);
				for (const key of ['init', 'test', 'update', 'left', 'right', 'body']) {
					const read = readsState(node[key], loop, state, active);
					if (read !== null) return read;
				}
				return null;
			}
		}
		for (const key in node) {
			if (SKIP_KEYS.has(key) || key.startsWith('_octane')) continue;
			const read = readsState(node[key], scope, state, active);
			if (read !== null) return read;
		}
		return null;
	}
}

const SHAPE_CONSTRUCTORS = new Set(['Map', 'Set', 'Array']);

function unwrapIdentifierName(node) {
	return node?.type === 'Identifier' ? node.name : null;
}
