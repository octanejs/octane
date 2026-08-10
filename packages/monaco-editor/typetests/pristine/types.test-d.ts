import Editor, {
	DiffEditor,
	useMonaco,
	type EditorProps,
	type DiffEditorProps,
	type OnChange,
	type Monaco,
} from '@monaco-editor/react';

// Group 1
const editorProps: EditorProps = {
	value: 'x',
	language: 'typescript',
	loading: 'Loading...',
	onChange: ((_value, _ev) => {}) satisfies OnChange,
};

// Group 2
// @ts-expect-error onChange must accept (value, ev)
const badOnChange: EditorProps = { onChange: (value: number) => value };

// Group 3
const diffProps: DiffEditorProps = {
	original: 'a',
	modified: 'b',
};

// Group 4
const onChange: OnChange = (value, ev) => {
	void value;
	void ev;
};

// Group 5
const monaco: Monaco | null = useMonaco();
void monaco;

// Group 6
void Editor;
void DiffEditor;
void editorProps;
void diffProps;
void onChange;
void badOnChange;
