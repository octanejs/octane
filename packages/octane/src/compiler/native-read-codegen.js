import { builders as b } from '@tsrx/core';

// Keep authored directive prologues first, but initialize a renderer capability
// and compiler slots before an authored top-level root can invoke local code.
export function nativeReadActivationIndex(body) {
	let index = 0;
	while (
		index < body.length &&
		body[index].type === 'ExpressionStatement' &&
		(body[index].expression?.type === 'Literal' ||
			body[index].expression?.type === 'StringLiteral') &&
		typeof body[index].expression.value === 'string'
	)
		index++;
	return index;
}

// The runtime owns collectors, subscriptions and attempt publication. These
// helpers only bracket compiled execution, without wrapping user code in a
// closure or changing its return/arguments/this semantics. Runtime imports and
// names are allocated by the normal compiler context supplied by the caller.
function bracket(statements, begin, finish, names) {
	const frame = b.id(names.alloc('__nativeFrame'));
	const completed = b.id(names.alloc('__nativeCompleted'));
	const error = b.id(names.alloc('__nativeError'));
	return [
		b.const(frame, begin),
		b.let(completed, b.literal(true)),
		b.try(
			b.block(statements),
			b.catch_clause(
				error,
				null,
				b.block([
					b.stmt(b.assignment('=', completed, b.literal(false))),
					{ type: 'ThrowStatement', argument: error },
				]),
			),
			b.block([b.stmt(finish(frame, completed))]),
		),
	];
}

export function wrapNativeReadScope(statements, scope, names) {
	return bracket(
		statements,
		b.call(names.runtime('beginNativeReadScope'), scope, b.literal(1)),
		(frame, completed) => b.call(names.runtime('endNativeReadScope'), frame, completed),
		names,
	);
}

// Warm plans may execute getters in guards and props before entering a cached
// creation. Keep all of that speculative execution outside the real owner's
// subscription set; only the creation's own witness is later adoptable.
export function wrapNativeWarmScope(statements, names) {
	return bracket(
		statements,
		b.call(names.runtime('beginNativeReadWitness'), b.literal(true)),
		(frame) => b.call(names.runtime('finishNativeReadWitness'), frame, b.literal(false)),
		names,
	);
}

export function captureNativeReadWitness(statements, names) {
	const witness = b.id(names.alloc('__nativeWitness'));
	return {
		witness,
		statements: [
			b.let(witness, null),
			...bracket(
				statements,
				b.call(names.runtime('beginNativeReadWitness')),
				(frame, completed) =>
					b.assignment(
						'=',
						witness,
						b.call(names.runtime('finishNativeReadWitness'), frame, completed),
					),
				names,
			),
		],
	};
}
