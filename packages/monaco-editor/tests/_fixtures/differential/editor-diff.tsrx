import Editor, { DiffEditor, useMonaco } from '@octanejs/monaco-editor';

export function EditorDiff(props: {
	value?: string;
	defaultValue?: string;
	language?: string;
	onMount?: (editor: unknown, monaco: unknown) => void;
	onChange?: (value: string | undefined) => void;
}) @{
	<div data-testid="editor-root">
		<Editor height="200px" {...props} />
	</div>
}

export function DiffEditorDiff(props: {
	original?: string;
	modified?: string;
	language?: string;
	onMount?: (editor: unknown, monaco: unknown) => void;
}) @{
	<div data-testid="diff-root">
		<DiffEditor height="200px" {...props} />
	</div>
}

export function UseMonacoDiff() @{
	const monaco = useMonaco();
	<div data-testid="use-monaco">{(monaco ? 'ready' : 'pending') as string}</div>
}
