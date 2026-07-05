// Ported from .base-ui/packages/react/src/internals/labelable-provider/LabelableContext.ts.
// Associates a labelable element with an accessible name/description. Standalone controls read
// the default (no label association; `registerControlId === NOOP` marks "no provider").
import { createContext, useContext } from 'octane';

import { NOOP } from '../noop';

export interface LabelableContextValue {
	controlId: string | null | undefined;
	registerControlId: (source: symbol, id: string | null | undefined) => void;
	labelId: string | undefined;
	setLabelId: (
		next: string | undefined | ((prev: string | undefined) => string | undefined),
	) => void;
	messageIds: string[];
	setMessageIds: (next: string[] | ((prev: string[]) => string[])) => void;
	getDescriptionProps: (externalProps: Record<string, any>) => Record<string, any>;
}

export const LabelableContext = createContext<LabelableContextValue>({
	controlId: undefined,
	registerControlId: NOOP,
	labelId: undefined,
	setLabelId: NOOP,
	messageIds: [],
	setMessageIds: NOOP,
	getDescriptionProps: (externalProps: Record<string, any>) => externalProps,
});

export function useLabelableContext(): LabelableContextValue {
	return useContext(LabelableContext);
}
