/** Only caller-authored primitive values can specialize a child program. */
import { builders as b } from '@tsrx/core';
import { inheritHookMemoOrigin as origin } from './inline-hook-memo.js';

export function bindingPrimitive(node) {
	while (
		[
			'TSAsExpression',
			'TSTypeAssertion',
			'TSNonNullExpression',
			'TSSatisfiesExpression',
			'ParenthesizedExpression',
		].includes(node?.type)
	)
		node = node.expression;
	if (
		node?.type === 'Literal' &&
		(node.value === null ||
			['string', 'boolean'].includes(typeof node.value) ||
			(typeof node.value === 'number' && Number.isFinite(node.value) && !Object.is(node.value, -0)))
	)
		return { value: node.value };
	if (
		node?.type === 'UnaryExpression' &&
		node.operator === 'void' &&
		node.argument?.type === 'Literal'
	)
		return { value: undefined };
	return null;
}

const UNKNOWN = Symbol('unknown binding value');
const OMIT = new Set([
	'loc',
	'start',
	'end',
	'range',
	'metadata',
	'parent',
	'comments',
	'leadingComments',
	'trailingComments',
	'innerComments',
	'typeAnnotation',
	'typeParameters',
]);
const literal = (value, node) => origin(value === undefined ? b.void0 : b.literal(value), node);
const GENERIC = {
	fold: (node) => node,
	known: () => UNKNOWN,
	unknown: UNKNOWN,
	checks: [],
	literal,
};

export function fixedBindingProps(fn, fixed, lexical, localDeclaration, isReference) {
	if (!fixed?.length) return GENERIC;
	const values = new Map(fixed);
	const bindings = new Map();
	const checks = [];
	const parameter = fn.params[0];
	const resolve = (node) => lexical.resolveBinding(lexical.nodeScopes.get(node), node.name)?.scope;
	if (parameter?.type === 'ObjectPattern') {
		for (const property of parameter.properties) {
			if (property.type !== 'Property') continue;
			const key = String(property.key.name ?? property.key.value);
			if (!values.has(key)) continue;
			const pattern = property.value;
			const binding = pattern.type === 'AssignmentPattern' ? pattern.left : pattern;
			const supplied = values.get(key);
			let value = supplied;
			if (supplied === undefined && pattern.type === 'AssignmentPattern') {
				const fallback = bindingPrimitive(pattern.right);
				if (!fallback) continue;
				value = fallback.value;
			}
			bindings.set(binding.name, { scope: resolve(binding), value });
			checks.push([binding, value]);
		}
	} else if (parameter?.type === 'Identifier') {
		for (const [key, value] of values)
			checks.push([b.member(parameter, b.literal(key), true), value]);
	}
	const known = (input, seen = new Set()) => {
		let node = input;
		while (
			[
				'TSAsExpression',
				'TSTypeAssertion',
				'TSNonNullExpression',
				'TSSatisfiesExpression',
				'ParenthesizedExpression',
			].includes(node?.type)
		)
			node = node.expression;
		const primitive = bindingPrimitive(node);
		if (primitive) return primitive.value;
		if (node?.type === 'Identifier') {
			const binding = bindings.get(node.name);
			if (binding && binding.scope === resolve(node)) return binding.value;
			const declaration = localDeclaration(node);
			if (!declaration || seen.has(declaration)) return UNKNOWN;
			return known(declaration.init, new Set(seen).add(declaration));
		}
		if (
			node?.type === 'MemberExpression' &&
			!node.optional &&
			parameter?.type === 'Identifier' &&
			node.object.type === 'Identifier' &&
			node.object.name === parameter.name &&
			resolve(node.object) === resolve(parameter)
		) {
			const key = node.computed ? bindingPrimitive(node.property)?.value : node.property.name;
			return typeof key === 'string' && values.has(key) ? values.get(key) : UNKNOWN;
		}
		if (node?.type === 'ConditionalExpression') {
			const test = known(node.test, seen);
			return test === UNKNOWN ? UNKNOWN : known(test ? node.consequent : node.alternate, seen);
		}
		if (node?.type === 'LogicalExpression') {
			const left = known(node.left, seen);
			if (left === UNKNOWN) return UNKNOWN;
			return (
				node.operator === '&&'
					? !left
					: node.operator === '||'
						? !!left
						: left !== null && left !== undefined
			)
				? left
				: known(node.right, seen);
		}
		if (node?.type === 'UnaryExpression') {
			const value = known(node.argument, seen);
			if (value === UNKNOWN) return UNKNOWN;
			switch (node.operator) {
				case '!':
					return !value;
				case '+':
					return +value;
				case '-':
					return -value;
				case '~':
					return ~value;
				case 'typeof':
					return typeof value;
				case 'void':
					return undefined;
			}
		}
		if (node?.type === 'BinaryExpression') {
			const left = known(node.left, seen),
				right = known(node.right, seen);
			if (left === UNKNOWN || right === UNKNOWN) return UNKNOWN;
			switch (node.operator) {
				case '===':
					return left === right;
				case '!==':
					return left !== right;
				case '==':
					return left == right;
				case '!=':
					return left != right;
				case '<':
					return left < right;
				case '<=':
					return left <= right;
				case '>':
					return left > right;
				case '>=':
					return left >= right;
				case '+':
					return left + right;
				case '-':
					return left - right;
				case '*':
					return left * right;
				case '/':
					return left / right;
				case '%':
					return left % right;
			}
		}
		return UNKNOWN;
	};
	const fold = (node, parent = null, key = null) => {
		if (!node || typeof node !== 'object') return node;
		// Native callbacks execute later and may write captured parameters or
		// read local declarations before initialization. Preserve their bodies.
		if (
			['ArrowFunctionExpression', 'FunctionExpression', 'FunctionDeclaration'].includes(node.type)
		)
			return node;
		if (Array.isArray(node)) {
			const result = node.map((child) => fold(child, parent, key));
			return result.some((child, i) => child !== node[i]) ? result : node;
		}
		if (
			node.type?.endsWith('Expression') ||
			(node.type === 'Identifier' && isReference(node, lexical, parent, key))
		) {
			const value = known(node);
			if (
				value !== UNKNOWN &&
				(typeof value !== 'number' || (Number.isFinite(value) && !Object.is(value, -0)))
			)
				return literal(value, node);
			if (node.type === 'ConditionalExpression') {
				const test = known(node.test);
				if (test !== UNKNOWN) return fold(test ? node.consequent : node.alternate);
			}
			if (node.type === 'LogicalExpression') {
				const left = known(node.left);
				if (left !== UNKNOWN)
					return fold(
						(
							node.operator === '&&'
								? !left
								: node.operator === '||'
									? !!left
									: left !== null && left !== undefined
						)
							? node.left
							: node.right,
					);
			}
		}
		let result = node;
		for (const [childKey, child] of Object.entries(node)) {
			if (OMIT.has(childKey)) continue;
			const next = fold(child, node, childKey);
			if (next !== child) {
				if (result === node) result = { ...node };
				result[childKey] = next;
			}
		}
		if (
			result !== node &&
			result.type === 'Property' &&
			result.shorthand &&
			result.value !== node.value
		) {
			// Expanding this shorthand must retain an own data property, not
			// introduce the object-literal prototype setter syntax.
			if (!node.computed && node.key.name === '__proto__')
				return {
					...result,
					key: literal('__proto__', node.key),
					computed: true,
					shorthand: false,
				};
			return { ...result, shorthand: false };
		}
		return result;
	};
	return { fold, known, unknown: UNKNOWN, checks, literal };
}
