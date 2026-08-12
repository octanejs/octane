import type { editor } from 'monaco-editor';
import { expectTypeOf } from 'vitest';

import Editor, {
	DiffEditor,
	loader,
	useMonaco,
	type DiffEditorProps,
	type EditorProps,
	type Monaco,
	type MonacoDiffEditor,
	type MonacoEditor,
	type OnChange,
} from '@octanejs/monaco-editor';

// Group 1
const editorPropsMinimal: EditorProps = {
	value: 'x',
	language: 'typescript',
	loading: 'Loading...',
	onChange: ((_value, _ev) => {}) satisfies OnChange,
};

// Group 2
// @ts-expect-error onChange must accept (value, ev)
const badOnChange: EditorProps = { onChange: (value: number) => value };

// Group 3
const diffPropsMinimal: DiffEditorProps = {
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
void editorPropsMinimal;
void diffPropsMinimal;
void onChange;
void badOnChange;

// Group 7 — full public props surface
const editorProps: EditorProps = {
	defaultValue: 'initial',
	value: 'controlled',
	defaultLanguage: 'plaintext',
	language: 'typescript',
	defaultPath: 'file:///default.ts',
	path: 'file:///controlled.ts',
	theme: 'vs',
	line: 10,
	options: { minimap: { enabled: false } },
	overrideServices: {},
	saveViewState: true,
	keepCurrentModel: false,
	width: '100%',
	height: 400,
	className: 'editor',
	wrapperProps: { 'aria-label': 'Code editor' },
	beforeMount(monacoInstance) {
		expectTypeOf(monacoInstance).toEqualTypeOf<Monaco>();
	},
	onMount(instance, monacoInstance) {
		expectTypeOf(instance).toEqualTypeOf<MonacoEditor>();
		expectTypeOf(monacoInstance).toEqualTypeOf<Monaco>();
	},
	onChange(value, event) {
		expectTypeOf(value).toEqualTypeOf<string | undefined>();
		expectTypeOf(event).toEqualTypeOf<editor.IModelContentChangedEvent>();
	},
	onValidate(markers) {
		expectTypeOf(markers).toEqualTypeOf<editor.IMarker[]>();
	},
};

const diffProps: DiffEditorProps = {
	original: 'before',
	modified: 'after',
	language: 'typescript',
	originalLanguage: 'json',
	modifiedLanguage: 'javascript',
	originalModelPath: 'file:///before.ts',
	modifiedModelPath: 'file:///after.ts',
	keepCurrentOriginalModel: false,
	keepCurrentModifiedModel: true,
	options: { renderSideBySide: false },
	onMount(instance, monacoInstance) {
		expectTypeOf(instance).toEqualTypeOf<MonacoDiffEditor>();
		expectTypeOf(monacoInstance).toEqualTypeOf<Monaco>();
	},
};

expectTypeOf(Editor).toBeFunction();
expectTypeOf(DiffEditor).toBeFunction();
void editorProps;
void diffProps;

// Group 8
loader.config({ monaco: null as unknown as Monaco });

// Group 9
expectTypeOf(useMonaco()).toEqualTypeOf<Monaco | null>();
// @ts-expect-error useMonaco matches the upstream zero-argument signature.
useMonaco('unexpected');
