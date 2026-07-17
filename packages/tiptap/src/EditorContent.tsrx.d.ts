import type { Editor } from '@tiptap/core';

import type { ContentComponent } from './Editor';

export type EditorContentRef<T> =
	| { current: T | null }
	| ((value: T | null) => void | (() => void))
	| null;

/**
 * Props accepted by the Octane editor host. Unknown host attributes are passed
 * through to the rendered `div` without introducing a React type dependency.
 */
export interface EditorContentProps {
	editor: Editor | null;
	ref?: EditorContentRef<HTMLDivElement>;
	innerRef?: EditorContentRef<HTMLDivElement>;
	children?: unknown;
	[key: string]: unknown;
}

export declare function createContentComponent(): ContentComponent;
export declare function PureEditorContent(props: EditorContentProps): unknown;
export declare const EditorContent: (props: EditorContentProps) => unknown;
