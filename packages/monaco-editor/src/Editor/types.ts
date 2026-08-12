import type { OctaneNode } from 'octane';
import type { editor } from 'monaco-editor';

import type { Monaco, Theme } from '../types';
import type { WrapperProps } from '../MonacoContainer/types';

export type MonacoEditor = editor.IStandaloneCodeEditor;

export type BeforeMount = (monaco: Monaco) => void;
export type OnMount = (editor: MonacoEditor, monaco: Monaco) => void;
export type OnChange = (value: string | undefined, event: editor.IModelContentChangedEvent) => void;
export type OnValidate = (markers: editor.IMarker[]) => void;

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
