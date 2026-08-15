// Vendored from @tanstack/db@0.7.0
// (packages/db/src/collection/change-events.ts: createFilterFunctionFromExpression).
// Not part of the public API; pinned here so the infinite-query tests can
// evaluate the where/cursor IR expressions @tanstack/db generates internally.
import { IR } from '@tanstack/db';
import { compileSingleRowExpression, toBooleanPredicate } from './evaluators';

export function createFilterFunctionFromExpression<T extends object>(
	expression: IR.BasicExpression<boolean>,
): (item: T) => boolean {
	// Compile expression once when filter function is created, not on every invocation
	const evaluator = compileSingleRowExpression(expression);

	return (item: T): boolean => {
		try {
			const result = evaluator(item as Record<string, unknown>);
			return toBooleanPredicate(result);
		} catch {
			// If evaluation fails, exclude the item
			return false;
		}
	};
}
