// Ported from react-aria-components (source: .react-spectrum/packages/react-aria-components/src/Autocomplete.tsx).
// PHASE-5: rest of this module pending — only the `FieldInputContext` token (and its value
// shape) is ported here so the field-primitive tier can wire against it.
// octane adaptations: `.tsx` → `.ts`; React types → the binding's ported equivalents.
import type {
	DOMProps,
	FocusableElement,
	FocusEvents,
	KeyboardEvents,
	ValueBase,
} from '@react-types/shared';
import { createContext } from 'octane';

import type { AriaTextFieldProps } from '../textfield/useTextField';
import type { ContextValue } from './utils';

interface FieldInputContextValue<T = FocusableElement>
	extends
		DOMProps,
		FocusEvents<T>,
		KeyboardEvents,
		Pick<ValueBase<string>, 'onChange' | 'value'>,
		Pick<
			AriaTextFieldProps,
			| 'enterKeyHint'
			| 'aria-controls'
			| 'aria-autocomplete'
			| 'aria-activedescendant'
			| 'spellCheck'
			| 'autoCorrect'
			| 'autoComplete'
		> {}

export const FieldInputContext =
	createContext<ContextValue<FieldInputContextValue, FocusableElement>>(null);
