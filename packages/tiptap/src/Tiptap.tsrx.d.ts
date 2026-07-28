import type { Editor } from '@tiptap/core';
import type { Context, OctaneNode } from 'octane';
import type { Octane } from 'octane/jsx-runtime';

import type { EditorContentProps } from './EditorContent.tsrx';
import type { EditorStateSnapshot } from './useEditorState';

export type TiptapContextType = {
	/** The Tiptap editor instance. */
	editor: Editor;
};

export declare const TiptapContext: Context<TiptapContextType> & {
	displayName?: string;
};

export declare function useTiptap(): TiptapContextType;

export declare function useTiptapState<TSelectorResult>(
	selector: (context: EditorStateSnapshot<Editor>) => TSelectorResult,
	equalityFn?: (a: TSelectorResult, b: TSelectorResult | null) => boolean,
): TSelectorResult;

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

export declare function TiptapWrapper(props: TiptapWrapperProps): Octane.JSX.Element;
export declare function TiptapContent(props: TiptapContentProps): Octane.JSX.Element;

export declare const Tiptap: typeof TiptapWrapper & {
	Content: typeof TiptapContent;
};

export default Tiptap;
