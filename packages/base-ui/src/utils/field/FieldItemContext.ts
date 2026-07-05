// Ported from .base-ui/packages/react/src/field/item/FieldItemContext.ts. A <Field.Item>
// (a labelled row inside a group) can disable its control; standalone reads the default.
import { createContext, useContext } from 'octane';

export interface FieldItemContextValue {
	disabled: boolean;
}

export const FieldItemContext = createContext<FieldItemContextValue>({ disabled: false });

export function useFieldItemContext(): FieldItemContextValue {
	return useContext(FieldItemContext);
}
