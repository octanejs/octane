// Ported from @tiptap/react 3.28.0 Tiptap.tsx. Refs remain ordinary props in
// Octane, and the compound Tiptap.Content component needs no forwardRef layer.
import type { Editor } from '@tiptap/core';
import { createContext, useContext, useMemo, type Context, type OctaneNode } from 'octane';

import { EditorContext } from './Context';
import { EditorContent, type EditorContentProps } from './EditorContent.tsrx';
import { splitSlot, subSlot } from './internal';
import {
	useEditorState,
	type EditorStateSnapshot,
	type UseEditorStateOptions,
} from './useEditorState';

export type TiptapContextType = {
	editor: Editor;
};

export type TiptapWrapperEditorInstanceProps =
	| {
			editor: Editor;
	  }
	| {
			/** @deprecated Use `editor` instead. */
			instance: Editor;
	  };

export type TiptapWrapperProps = TiptapWrapperEditorInstanceProps & {
	children: OctaneNode;
};

export type TiptapContentProps = Omit<EditorContentProps, 'editor' | 'ref'> & {
	editor?: never;
	ref?: never;
};

export const TiptapContext: Context<TiptapContextType> & { displayName?: string } = createContext({
	get editor(): Editor {
		throw new Error('useTiptap must be used within a <Tiptap> provider');
	},
});

TiptapContext.displayName = 'TiptapContext';

/** Read the editor instance provided by the nearest `Tiptap` component. */
export function useTiptap(): TiptapContextType {
	return useContext(TiptapContext);
}

/** Select a reactive slice of editor state from the context editor. */
export function useTiptapState<TSelectorResult>(
	selector: (context: EditorStateSnapshot<Editor>) => TSelectorResult,
	...args: [equalityFn?: (left: TSelectorResult, right: TSelectorResult | null) => boolean]
): TSelectorResult {
	const [userArgs, slot] = splitSlot(args);
	const equalityFn = userArgs[0] as
		| ((left: TSelectorResult, right: TSelectorResult | null) => boolean)
		| undefined;
	const { editor } = useTiptap();

	// Call through a non-hook-named alias because this source is itself compiled:
	// the public call site's slot is already being forwarded explicitly here.
	const selectEditorState = useEditorState as (
		options: UseEditorStateOptions<TSelectorResult, Editor>,
		slot: symbol,
	) => TSelectorResult;
	return selectEditorState(
		{
			editor,
			selector,
			equalityFn,
		},
		subSlot(slot, 'tiptap:state'),
	);
}

export function TiptapWrapper({ children, ...props }: TiptapWrapperProps) @{
	const resolvedEditor =
		'editor' in props ? props.editor : props.instance;

	if (!resolvedEditor) {
		throw new Error('Tiptap: An editor instance is required. Pass a non-null `editor` prop.');
	}

	const tiptapContextValue = useMemo(() => ({ editor: resolvedEditor }), [resolvedEditor]);
	const legacyContextValue = useMemo(() => ({ editor: resolvedEditor }), [resolvedEditor]);

	<EditorContext.Provider value={legacyContextValue}>
		<TiptapContext.Provider value={tiptapContextValue}>{children}</TiptapContext.Provider>
	</EditorContext.Provider>
}

TiptapWrapper.displayName = 'Tiptap';

/** Render EditorContent using the editor supplied by the nearest Tiptap root. */
export function TiptapContent(props: TiptapContentProps) @{
	const { editor } = useTiptap();

	<EditorContent {...props} editor={editor} />
}

TiptapContent.displayName = 'Tiptap.Content';

export const Tiptap = Object.assign(TiptapWrapper, {
	Content: TiptapContent,
});

export default Tiptap;
