import { builders as b } from '@tsrx/core';

function unwrapNonNullExpression(node) {
	while (node?.type === 'TSNonNullExpression') node = node.expression;
	return node;
}

/** Static hook methods need a call boundary, never an extra positional argument. */
export function hookMethodName(node, hookLocals) {
	if (
		node?.type !== 'CallExpression' ||
		node._octaneImportedHook ||
		node._octaneHookRuntimeImportedHook
	)
		return null;
	const callee = unwrapNonNullExpression(node.callee);
	// Namespace calls are owned by the lexical import analysis. If it did not
	// mark this call, the namespace is shadowed and must retain ordinary JS behavior.
	if (callee?.object?.type === 'Identifier' && hookLocals?.get(callee.object.name) === '*')
		return null;
	return callee?.type === 'MemberExpression' &&
		!callee.computed &&
		callee.property?.type === 'Identifier' &&
		/^use[A-Z]/.test(callee.property.name)
		? callee.property.name
		: null;
}

export function hasHookMethods(node) {
	if (!node || typeof node !== 'object') return false;
	if (Array.isArray(node)) return node.some(hasHookMethods);
	if (hookMethodName(node) !== null) return true;
	return Object.keys(node).some(
		(key) => key !== 'loc' && key !== 'metadata' && hasHookMethods(node[key]),
	);
}

// The call boundary is synchronous. Moving a suspension expression into its
// callback would produce invalid JavaScript; nested callbacks keep their own
// lexical function scope and are safe to pass as ordinary arguments.
export function assertSynchronousHookMethod(node) {
	function suspends(value) {
		if (!value || typeof value !== 'object') return false;
		if (Array.isArray(value)) return value.some(suspends);
		if (value.type === 'AwaitExpression' || value.type === 'YieldExpression') return true;
		if (
			value.type === 'ArrowFunctionExpression' ||
			value.type === 'FunctionExpression' ||
			value.type === 'FunctionDeclaration'
		)
			return false;
		return Object.keys(value).some(
			(key) => key !== 'loc' && key !== 'metadata' && suspends(value[key]),
		);
	}
	if (suspends(node)) {
		throw new SyntaxError(
			'An Octane hook method cannot contain await or yield in its receiver or arguments. Evaluate the suspended expression before calling the hook method.',
		);
	}
}

// A call boundary inside a ChainExpression would end its short-circuit region.
// Lower only affected chains, sharing the guard/receiver rules between emitters.
export function lowerHookMethodChain(chain, options, deleting = false) {
	if (chain?.type !== 'ChainExpression') return null;
	const links = [];
	let base = chain.expression;
	while (
		base.type === 'MemberExpression' ||
		base.type === 'CallExpression' ||
		base.type === 'TSNonNullExpression'
	) {
		links.unshift(base);
		base =
			base.type === 'MemberExpression'
				? base.object
				: base.type === 'CallExpression'
					? base.callee
					: base.expression;
	}
	const firstOptional = links.findIndex((link) => link.optional);
	if (
		firstOptional === -1 ||
		!links.slice(firstOptional).some((link) => hookMethodName(link, options.locals) !== null)
	)
		return null;
	assertSynchronousHookMethod(chain);
	base =
		links[firstOptional].type === 'MemberExpression'
			? links[firstOptional].object
			: links[firstOptional].callee;
	const steps = links.slice(firstOptional);
	const skipped = deleting ? b.literal(true) : b.void0;
	function scope(value, next) {
		const local = b.id(options.allocateName('_oc$'));
		return b.call(b.arrow([local], next(local)), value);
	}
	function guard(value, next) {
		return b.conditional(
			b.logical('||', b.binary('===', value, b.literal(null)), b.binary('===', value, b.void0)),
			skipped,
			next(value),
		);
	}
	const properties = new Map();
	function member(object, link) {
		if (link.computed && !properties.has(link)) properties.set(link, options.visit(link.property));
		return {
			...link,
			object,
			property: link.computed ? properties.get(link) : link.property,
			optional: false,
		};
	}
	function proceed(value, index, reference = null) {
		if (index === steps.length) return deleting ? b.unary('delete', value) : value;
		const link = steps[index];
		if (link.type === 'TSNonNullExpression')
			return proceed({ ...link, expression: value }, index + 1, reference);
		if (link.type === 'MemberExpression') {
			const next = (object) => proceed(member(object, link), index + 1, { object, link });
			return link.optional ? scope(value, (local) => guard(local, next)) : next(value);
		}
		const args = () => link.arguments.map(options.visit);
		const method = hookMethodName(link, options.locals);
		const invoke = (call) => (method === null ? call : options.wrap(call, link, method));
		if (!link.optional) {
			return proceed(
				invoke({ ...link, callee: value, arguments: args(), optional: false }),
				index + 1,
			);
		}
		const call = (fn, receiver) =>
			guard(fn, () =>
				proceed(invoke(b.call(options.requireReceiver(), fn, receiver, ...args())), index + 1),
			);
		if (reference !== null) {
			if (reference.object.type === 'Super') {
				return scope(value, (fn) => call(fn, b.this));
			}
			return scope(reference.object, (receiver) =>
				scope(member(receiver, reference.link), (fn) => call(fn, receiver)),
			);
		}
		return scope(value, (fn) => call(fn, b.void0));
	}
	const referenceBase = unwrapNonNullExpression(base);
	const reference =
		referenceBase.type === 'MemberExpression'
			? {
					object:
						referenceBase.object.type === 'Super'
							? referenceBase.object
							: options.visit(referenceBase.object),
					link: referenceBase,
				}
			: null;
	return proceed(
		reference === null ? options.visit(base) : member(reference.object, referenceBase),
		0,
		reference,
	);
}
