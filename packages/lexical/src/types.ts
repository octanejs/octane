import type {
	EditorState,
	EditorThemeClasses,
	HTMLConfig,
	Klass,
	LexicalEditor,
	LexicalNode,
	LexicalNodeReplacement,
} from 'lexical';

// Real types for LexicalComposer's config (its component lives in a `.tsrx`, which
// tsgo treats as `any` via the ambient module — so the typed surface lives here).

export type InitialEditorStateType =
	null | string | EditorState | ((editor: LexicalEditor) => void);

export type InitialConfigType = Readonly<{
	namespace: string;
	nodes?: readonly (Klass<LexicalNode> | LexicalNodeReplacement)[];
	onError: (error: Error, editor: LexicalEditor) => void;
	onWarn?: (error: Error, editor: LexicalEditor) => void;
	editable?: boolean;
	theme?: EditorThemeClasses;
	editorState?: InitialEditorStateType;
	html?: HTMLConfig;
}>;
