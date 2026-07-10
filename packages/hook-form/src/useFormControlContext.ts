// Vendored from react-hook-form@7.81.0 src/useFormControlContext.ts (octane port).
// octane: HookFormContext (module-local in upstream's useFormContext.tsx) also
// lives here so FormProvider.tsrx can import it — this module is internal (not
// star-exported from index.ts), so neither context leaks into the public API.
import { createContext, useContext } from 'octane';

import type { Control, FieldValues, UseFormReturn } from './types';

export const HookFormContext = createContext<UseFormReturn | null>(null);

/**
 * Separate context for `control` to prevent unnecessary rerenders.
 * Internal hooks that only need control use this instead of full form context.
 */
export const HookFormControlContext = createContext<Control | null>(null);

/**
 * @internal Internal hook to access only control from context.
 */
export const useFormControlContext = <
	TFieldValues extends FieldValues,
	TContext = any,
	TTransformedValues = TFieldValues,
>(): Control<TFieldValues, TContext, TTransformedValues> =>
	useContext(HookFormControlContext) as Control<TFieldValues, TContext, TTransformedValues>;
