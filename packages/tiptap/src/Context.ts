import type { Editor } from '@tiptap/core';
import { createContext, useContext } from 'octane';

/** The editor value shared by the legacy TipTap context API. */
export type EditorContextValue = {
	editor: Editor | null;
};

export const EditorContext = createContext<EditorContextValue>({
	editor: null,
});

/** Read the editor from the nearest `EditorProvider` or `Tiptap` component. */
export function useCurrentEditor(): EditorContextValue {
	return useContext(EditorContext);
}
