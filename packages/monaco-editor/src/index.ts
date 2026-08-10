import loader from '@monaco-editor/loader';
export { loader };

import DiffEditor from './DiffEditor';
export * from './DiffEditor/types';
export { DiffEditor };

import useMonaco from './hooks/useMonaco';
export { useMonaco };

import Editor from './Editor';
export * from './Editor/types';
export { Editor };
export default Editor;

export type { Monaco, Theme } from './types';
export type { WrapperProps } from './MonacoContainer/types';
