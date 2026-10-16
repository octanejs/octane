// Syntax/annotation proof shared by text bindings and non-text optimizations.
// Child-only callers may additionally consume the authored proof metadata above;
// attribute and non-nullish checks keep the original conservative contract.
// The text runtime normalizes values centrally, including inaccurate assertions.
// Recognised shapes:
//   - String Literal:               'foo' / "bar"
//   - TemplateLiteral:               `${x}-${y}` (always coerces to string)
//   - `typeof x`:                   always a string, even for unknown x
//   - `as string` / `<string>x`:     user-asserted string-typed expression
//   - `satisfies string`:            same intent
//   - Wrappers (`!`, instantiation): peel and check inside
//   - String `+` concat:             at least one operand known-string
//   - Conditional:                    both result arms known-string
// Conservative — returns false for anything we can't prove. Safe to use
// from any text-binding site BEFORE the final Program's TS-wrapper strip.
export function isKnownStringExpression(node, locals, childProofs = false) {
	if (node == null || typeof node !== 'object') return false;
	if (childProofs && node.metadata?.octane_string_child === true) return true;
	if (node.type === 'Literal' || node.type === 'StringLiteral') {
		return typeof node.value === 'string';
	}
	if (node.type === 'TemplateLiteral') return true;
	if (node.type === 'UnaryExpression' && node.operator === 'typeof') return true;
	// An identifier the compiler has tracked back to a string in this component's
	// scope: a `const` bound to a provably-string expression, a `const x: string`,
	// or a `string`-typed param — see collectKnownStringLocals. `locals` is
	// component-scoped and has render-shadowed names removed, so a
	// `@for (const x …)` loop var never inherits an outer string `const x`. When
	// `locals` is absent (callers that don't track locals), identifiers are not
	// assumed string — the conservative pre-existing behaviour.
	if (node.type === 'Identifier') return locals != null && locals.has(node.name);
	if (
		node.type === 'TSAsExpression' ||
		node.type === 'TSTypeAssertion' ||
		node.type === 'TSSatisfiesExpression'
	) {
		const ann = node.typeAnnotation;
		if (
			ann &&
			(ann.type === 'TSStringKeyword' ||
				(ann.type === 'TSTypeReference' && ann.typeName && ann.typeName.name === 'string'))
		) {
			return true;
		}
		return isKnownStringExpression(node.expression, locals, childProofs);
	}
	if (
		node.type === 'TSNonNullExpression' ||
		node.type === 'TSInstantiationExpression' ||
		(childProofs && node.type === 'ParenthesizedExpression')
	) {
		return isKnownStringExpression(node.expression, locals, childProofs);
	}
	// `a + b` is a string if EITHER operand is a string (JS coerces the other).
	if (node.type === 'BinaryExpression' && node.operator === '+') {
		return (
			isKnownStringExpression(node.left, locals, childProofs) ||
			isKnownStringExpression(node.right, locals, childProofs)
		);
	}
	if (node.type === 'ConditionalExpression') {
		return (
			isKnownStringExpression(node.consequent, locals, childProofs) &&
			isKnownStringExpression(node.alternate, locals, childProofs)
		);
	}
	if (node.type === 'LogicalExpression') {
		return (
			isKnownStringExpression(node.left, locals, childProofs) &&
			isKnownStringExpression(node.right, locals, childProofs)
		);
	}
	if (node.type === 'SequenceExpression') {
		return isKnownStringExpression(node.expressions.at(-1), locals, childProofs);
	}
	return false;
}

// Child text is deliberately separate from attribute/non-nullish proofs. An
// explicit string assertion keeps its existing coercion intent; the optional
// semantic facts and scope-proven String calls only select the text-child ABI.
export function isKnownStringChildExpression(node, locals) {
	return isKnownStringExpression(node, locals, true);
}

// Only child positions may use the primitive-text binding for numbers and
// bigints. These expressions are primitives (or throw before returning) under
// JavaScript's own operators. Keep the proof distinct from "known string":
// numeric results cannot establish that `value + anotherValue` concatenates.
export function isKnownTextChildExpression(node, stringLocals) {
	if (isKnownStringChildExpression(node, stringLocals)) return true;
	if (node == null || typeof node !== 'object') return false;
	if (node.metadata?.octane_primitive_text_child === true) return true;
	if (node.type === 'Literal' || node.type === 'NumericLiteral' || node.type === 'BigIntLiteral') {
		return (
			typeof node.value === 'number' ||
			typeof node.value === 'bigint' ||
			node.type === 'BigIntLiteral'
		);
	}
	if (node.type === 'UnaryExpression') {
		return node.operator === '+' || node.operator === '-' || node.operator === '~';
	}
	if (node.type === 'BinaryExpression') {
		if (node.operator === '+') {
			return (
				isKnownTextChildExpression(node.left, stringLocals) &&
				isKnownTextChildExpression(node.right, stringLocals)
			);
		}
		return NUMERIC_TEXT_OPERATORS.has(node.operator);
	}
	if (node.type === 'ConditionalExpression') {
		return (
			isKnownTextChildExpression(node.consequent, stringLocals) &&
			isKnownTextChildExpression(node.alternate, stringLocals)
		);
	}
	if (node.type === 'LogicalExpression') {
		return (
			isKnownTextChildExpression(node.left, stringLocals) &&
			isKnownTextChildExpression(node.right, stringLocals)
		);
	}
	if (node.type === 'SequenceExpression') {
		return isKnownTextChildExpression(node.expressions.at(-1), stringLocals);
	}
	if (
		node.type === 'TSAsExpression' ||
		node.type === 'TSTypeAssertion' ||
		node.type === 'TSSatisfiesExpression' ||
		node.type === 'TSNonNullExpression' ||
		node.type === 'TSInstantiationExpression' ||
		node.type === 'ParenthesizedExpression'
	) {
		return isKnownTextChildExpression(node.expression, stringLocals);
	}
	return false;
}

export const NUMERIC_TEXT_OPERATORS = new Set([
	'-',
	'*',
	'/',
	'%',
	'**',
	'<<',
	'>>',
	'>>>',
	'|',
	'&',
	'^',
]);

export function isComponentTag(node) {
	if (node.activityDescriptor === true) return true;
	const name = node.openingElement?.name || node.id;
	if (!name) return false;
	if (name.type === 'MemberExpression' || name.type === 'JSXMemberExpression') return true;
	// `<{expr}>` — @tsrx/core 0.1.29 emits a JSXExpressionContainer with
	// isDynamic === true at openingElement.name. Always a component (no HTML
	// string tag is possible here); routes through the same componentSlot
	// codegen path as `<Foo>` / `<ctx.Component>`.
	if (name.type === 'JSXExpressionContainer' && name.isDynamic === true) return true;
	if (name.type === 'Identifier' || name.type === 'JSXIdentifier') {
		if (typeof name.name !== 'string') return false;
		// JSX semantics (Babel/TS `isCompatTag`): an identifier tag is a HOST
		// string tag only when it starts with a lowercase ASCII letter (or isn't
		// a plain identifier, e.g. `<my-element>`); everything else — `<Foo>`,
		// `<_Inner>`, `<$Inner>` — is a component REFERENCE.
		return !/^[a-z]/.test(name.name) && !name.name.includes('-');
	}
	return false;
}
