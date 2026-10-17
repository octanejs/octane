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
function bracket(statements, begin, finish, names, result) {
	const frame = b.id(names.alloc('__nativeFrame'));
	const completed = result ?? b.id(names.alloc('__nativeCompleted'));
	const error = b.id(names.alloc('__nativeError'));
	// A result can hold the completion flag until finally replaces it with the
	// witness. Split its declaration so TypeScript output can infer the new type.
	const initialization = result
		? [b.let(completed), b.stmt(b.assignment('=', completed, b.literal(true)))]
		: [b.let(completed, b.literal(true))];
	return [
		b.const(frame, begin),
		...initialization,
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
	// An empty body (an empty @if/@else arm, a bodiless block callback) runs no
	// code that could read, so a scope would only publish the same empty read set
	// on every render. Module activation already enabled collection.
	if (statements.length === 0) return statements;
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
	const frame = b.id(names.alloc('__nativeFrame'));
	return [
		b.const(frame, b.call(names.runtime('beginNativeReadWitness'), b.literal(true))),
		b.try(
			b.block(statements),
			null,
			b.block([b.stmt(b.call(names.runtime('finishNativeReadWitness'), frame, b.literal(false)))]),
		),
	];
}

export function captureNativeReadWitness(statements, names) {
	const witness = b.id(names.alloc('__nativeWitness'));
	return {
		witness,
		statements: bracket(
			statements,
			b.call(names.runtime('beginNativeReadWitness')),
			(frame, completed) =>
				b.assignment(
					'=',
					witness,
					b.call(names.runtime('finishNativeReadWitness'), frame, completed),
				),
			names,
			witness,
		),
	};
}
