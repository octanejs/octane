import { createContext, createElement, useContext } from 'octane';

export interface ReactNodeViewContextProps {
	onDragStart?: (event: DragEvent) => void;
	nodeViewContentRef?: (element: HTMLElement | null) => void;
	/** Static-rendered content exposed through NodeViewContent. */
	nodeViewContentChildren?: unknown;
}

export const ReactNodeViewContext = createContext<ReactNodeViewContextProps>({
	onDragStart: () => {},
	nodeViewContentChildren: undefined,
	nodeViewContentRef: () => {},
});

export interface ReactNodeViewContentProviderProps {
	children: unknown;
	content: unknown;
}

/** Supply static node content without creating a live ProseMirror content DOM. */
export function ReactNodeViewContentProvider({
	children,
	content,
}: ReactNodeViewContentProviderProps): unknown {
	return createElement(ReactNodeViewContext.Provider, {
		value: { nodeViewContentChildren: content },
		children,
	});
}

export const useReactNodeView = (): ReactNodeViewContextProps => useContext(ReactNodeViewContext);
