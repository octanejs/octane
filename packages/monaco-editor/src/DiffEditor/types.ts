import type { OctaneNode } from 'octane';
import type { editor } from 'monaco-editor';

import type { Monaco, Theme } from '../types';
import type { WrapperProps } from '../MonacoContainer/types';

export type MonacoDiffEditor = editor.IStandaloneDiffEditor;

export type DiffBeforeMount = (monaco: Monaco) => void;
export type DiffOnMount = (editor: MonacoDiffEditor, monaco: Monaco) => void;

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
