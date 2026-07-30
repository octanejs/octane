import type { OctaneNode } from 'octane';
import type { Octane } from 'octane/jsx-runtime';
import type { editor } from 'monaco-editor';
import type * as monaco from 'monaco-editor';

export type Monaco = typeof monaco;
export type Theme = 'vs-dark' | 'light';

export type MonacoEditor = editor.IStandaloneCodeEditor;
export type MonacoDiffEditor = editor.IStandaloneDiffEditor;

export type BeforeMount = (monaco: Monaco) => void;
export type OnMount = (editor: MonacoEditor, monaco: Monaco) => void;
export type OnChange = (value: string | undefined, event: editor.IModelContentChangedEvent) => void;
export type OnValidate = (markers: editor.IMarker[]) => void;

export type DiffBeforeMount = (monaco: Monaco) => void;
export type DiffOnMount = (editor: MonacoDiffEditor, monaco: Monaco) => void;

export type WrapperProps = Omit<Octane.JSX.IntrinsicElements['section'], 'children'>;

export interface EditorProps {
	defaultValue?: string;
	defaultLanguage?: string;
	defaultPath?: string;
	value?: string;
	language?: string;
	path?: string;
	theme?: Theme | string;
	line?: number;
	loading?: OctaneNode;
	options?: editor.IStandaloneEditorConstructionOptions;
	overrideServices?: editor.IEditorOverrideServices;
	saveViewState?: boolean;
	keepCurrentModel?: boolean;
	width?: number | string;
	height?: number | string;
	className?: string;
	wrapperProps?: WrapperProps;
	beforeMount?: BeforeMount;
	onMount?: OnMount;
	onChange?: OnChange;
	onValidate?: OnValidate;
}

export interface DiffEditorProps {
	original?: string;
	modified?: string;
	language?: string;
	originalLanguage?: string;
	modifiedLanguage?: string;
	originalModelPath?: string;
	modifiedModelPath?: string;
	keepCurrentOriginalModel?: boolean;
	keepCurrentModifiedModel?: boolean;
	theme?: Theme | string;
	loading?: OctaneNode;
	options?: editor.IDiffEditorConstructionOptions;
	width?: number | string;
	height?: number | string;
	className?: string;
	wrapperProps?: WrapperProps;
	beforeMount?: DiffBeforeMount;
	onMount?: DiffOnMount;
}
