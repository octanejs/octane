// Direct native bindings recognize capability syntax, not structural `.get`
// methods. Share this syntax boundary between runtime and virtual TSX lowering.
function unwrapExpression(node) {
	while (
		node &&
		(node.type === 'TSAsExpression' ||
			node.type === 'TSTypeAssertion' ||
			node.type === 'TSNonNullExpression' ||
			node.type === 'TSSatisfiesExpression' ||
			node.type === 'TSInstantiationExpression' ||
			node.type === 'ChainExpression' ||
			node.type === 'ParenthesizedExpression')
	) {
		node = node.expression;
	}
	return node;
}

export function isDirectSignalHandleExpression(node) {
	node = unwrapExpression(node);
	if (!node) return false;
	if (node.type === 'Identifier') return node.name.endsWith('$');
	if (node.type === 'MemberExpression' || node.type === 'OptionalMemberExpression') {
		const name = node.computed
			? node.property?.type === 'Literal' && typeof node.property.value === 'string'
				? node.property.value
				: null
			: node.property?.name;
		return typeof name === 'string' && name.endsWith('$');
	}
	if (node.type === 'CallExpression' || node.type === 'OptionalCallExpression') {
		const callee = unwrapExpression(node.callee);
		const name =
			callee?.type === 'Identifier'
				? callee.name
				: callee?.type === 'MemberExpression' || callee?.type === 'OptionalMemberExpression'
					? callee.computed
						? callee.property?.value
						: callee.property?.name
					: null;
		return /^_?\$?__(?:signal|derived|query)At$/.test(name ?? '');
	}
	return false;
}

function rejectNestedHandles(node) {
	if (!node || typeof node !== 'object') return;
	if (isDirectSignalHandleExpression(node))
		throw new Error(
			'Native JSX signal projections do not support handles inside callbacks, constructors, or tagged templates.',
		);
	for (const key of Object.keys(node)) {
		if (!['metadata', 'loc', 'start', 'end'].includes(key)) rejectNestedHandles(node[key]);
	}
}

/** Only an explicitly configured native attribute admits these sampled reads. */
export function lowerNativeAttributeReads(expression, read) {
	let reactive = false;
	const rewrite = (node) => {
		if (!node || typeof node !== 'object') return node;
		if (Array.isArray(node)) return node.map(rewrite);
		if (isDirectSignalHandleExpression(node)) {
			reactive = true;
			return read(node);
		}
		if (node.type === 'MemberExpression' || node.type === 'OptionalMemberExpression') {
			if (isDirectSignalHandleExpression(node.object))
				throw new Error(
					'Native JSX signal projections require .get() before reading a signal payload property.',
				);
			return {
				...node,
				object: rewrite(node.object),
				property: node.computed ? rewrite(node.property) : node.property,
			};
		}
		if (node.type === 'CallExpression' || node.type === 'OptionalCallExpression') {
			const callee = unwrapExpression(node.callee);
			const handleGet =
				(callee?.type === 'MemberExpression' || callee?.type === 'OptionalMemberExpression') &&
				(callee.computed ? callee.property?.value : callee.property?.name) === 'get' &&
				isDirectSignalHandleExpression(callee.object);
			if (handleGet) reactive = true;
			return {
				...node,
				// Keep a method call as a member call so `this` and evaluation order
				// survive a computed style selection. Explicit get keeps its receiver.
				callee:
					!handleGet &&
					(callee?.type === 'MemberExpression' || callee?.type === 'OptionalMemberExpression')
						? rewrite(node.callee)
						: node.callee,
				arguments: node.arguments.map(rewrite),
			};
		}
		if (
			[
				'FunctionExpression',
				'ArrowFunctionExpression',
				'ClassExpression',
				'NewExpression',
				'TaggedTemplateExpression',
			].includes(node.type)
		) {
			rejectNestedHandles(node);
			return node;
		}
		if (node.type === 'Property') {
			const value = rewrite(node.value);
			return value === node.value ? node : { ...node, value, shorthand: false };
		}
		let result = node;
		for (const key of Object.keys(node)) {
			if (['metadata', 'loc', 'start', 'end'].includes(key)) continue;
			const value = node[key];
			if (!value || typeof value !== 'object') continue;
			const next = rewrite(value);
			if (next !== value) {
				if (result === node) result = { ...node };
				result[key] = next;
			}
		}
		return result;
	};
	return { expression: rewrite(expression), reactive };
}
