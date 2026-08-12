import { createContext, useContext } from 'octane';

import type { DocumentContextValue, OutlineContextValue, PageContextValue } from './types.js';

export const DocumentContext = createContext<DocumentContextValue | null>(null);
export const OutlineContext = createContext<OutlineContextValue | null>(null);
export const PageContext = createContext<PageContextValue | null>(null);

export function useDocumentContext(): DocumentContextValue | null {
	return useContext(DocumentContext);
}

export function useOutlineContext(): OutlineContextValue | null {
	return useContext(OutlineContext);
}

export function usePageContext(): PageContextValue | null {
	return useContext(PageContext);
}
