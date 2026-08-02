// Vendored from react-hook-form@7.81.0 src/watch.tsx (octane port).
// Watch component — subscribes to form field changes and re-renders when the
// watched fields update. Authored as .tsrx (full compile) so the useWatch call
// is slot-wrapped (see controller.tsrx note).
import { useWatch } from './useWatch.ts';
import type { FieldPath, FieldValues, WatchProps, WatchRenderValue } from './types';

export const Watch = <
	TFieldValues extends FieldValues = FieldValues,
	TFieldName extends | FieldPath<TFieldValues>
	| readonly [FieldPath<TFieldValues>, ...FieldPath<TFieldValues>[]]
	| FieldPath<TFieldValues>[]
	| readonly FieldPath<TFieldValues>[]
	| undefined = undefined,
	TContext = any,
	TTransformedValues = TFieldValues,
	TComputeValue = undefined,
>(props: WatchProps<TFieldName, TFieldValues, TContext, TTransformedValues, TComputeValue>) =>
	props.render(
		useWatch({ name: props.names, ...props as any }) as WatchRenderValue<
			TFieldName,
			TFieldValues,
			TComputeValue
		>,
	);
