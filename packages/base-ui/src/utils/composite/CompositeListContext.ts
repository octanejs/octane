// Ported from .base-ui/packages/react/src/internals/composite/list/CompositeListContext.ts.
import { createContext, useContext } from 'octane';

export interface CompositeListContextValue<Metadata> {
	register: (node: Element, metadata: Metadata) => void;
	unregister: (node: Element) => void;
	subscribeMapChange: (fn: (map: Map<Element, Metadata | null>) => void) => () => void;
	elementsRef: { current: Array<HTMLElement | null> };
	labelsRef?: { current: Array<string | null> } | undefined;
	nextIndexRef: { current: number };
}

export const CompositeListContext = createContext<CompositeListContextValue<any>>({
	register: () => {},
	unregister: () => {},
	subscribeMapChange: () => () => {},
	elementsRef: { current: [] },
	nextIndexRef: { current: 0 },
});

export function useCompositeListContext(): CompositeListContextValue<any> {
	return useContext(CompositeListContext);
}
