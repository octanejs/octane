// Vendored from react-hook-form@7.81.0 src/controller.tsx (octane port).
// Component based on `useController` to work with controlled components.
// Authored as .tsrx (full compile) — a component in binding src must have its
// custom-hook call slot-wrapped by the compiler; the plain-.ts slotting pass
// only slots BASE octane hooks (see compiler/slot-hooks.js).
import { useController } from './useController.ts';
import type { ControllerProps, FieldPath, FieldValues } from './types';

export const Controller = <
	TFieldValues extends FieldValues = FieldValues,
	TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
	TTransformedValues = TFieldValues,
>(props: ControllerProps<TFieldValues, TName, TTransformedValues>) => props.render(
	useController<TFieldValues, TName, TTransformedValues>(props),
);
