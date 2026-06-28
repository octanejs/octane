import type { EditorThemeClasses, LexicalEditor } from 'lexical';
import { createContext, useContext } from 'octane';

// Ported from @lexical/react/src/LexicalComposerContext.ts — pure context, no JSX,
// so it's an exact translation with `react` → `octane` (octane's createContext /
// useContext match React's: useContext is keyed by context identity, no hook slot).

export type LexicalComposerContextType = {
	getTheme: () => EditorThemeClasses | null | undefined;
};

export type LexicalComposerContextWithEditor = [LexicalEditor, LexicalComposerContextType];

export const LexicalComposerContext = createContext<
	LexicalComposerContextWithEditor | null | undefined
>(null);

export function createLexicalComposerContext(
	parent: LexicalComposerContextWithEditor | null | undefined,
	theme: EditorThemeClasses | null | undefined,
): LexicalComposerContextType {
	let parentContext: LexicalComposerContextType | null = null;

	if (parent != null) {
		parentContext = parent[1];
	}

	function getTheme(): EditorThemeClasses | null | undefined {
		if (theme != null) {
			return theme;
		}

		return parentContext != null ? parentContext.getTheme() : null;
	}

	return { getTheme };
}

export function useLexicalComposerContext(): LexicalComposerContextWithEditor {
	const composerContext = useContext(LexicalComposerContext);

	if (composerContext == null) {
		throw new Error(
			'LexicalComposerContext.useLexicalComposerContext: cannot find a LexicalComposerContext',
		);
	}

	return composerContext;
}
