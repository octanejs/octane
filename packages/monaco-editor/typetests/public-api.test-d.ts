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
} from '@octanejs/monaco-editor';

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
	beforeMount(monaco) {
		expectTypeOf(monaco).toEqualTypeOf<Monaco>();
	},
	onMount(instance, monaco) {
		expectTypeOf(instance).toEqualTypeOf<MonacoEditor>();
		expectTypeOf(monaco).toEqualTypeOf<Monaco>();
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
	onMount(instance, monaco) {
		expectTypeOf(instance).toEqualTypeOf<MonacoDiffEditor>();
		expectTypeOf(monaco).toEqualTypeOf<Monaco>();
	},
};

expectTypeOf(Editor).toBeFunction();
expectTypeOf(DiffEditor).toBeFunction();
void editorProps;
void diffProps;
loader.config({ monaco: null as unknown as Monaco });
expectTypeOf(useMonaco()).toEqualTypeOf<Monaco | null>();
// @ts-expect-error useMonaco matches the upstream zero-argument signature.
useMonaco('unexpected');
