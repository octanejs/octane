import Editor, { DiffEditor, type DiffOnMount, type OnMount } from '../../../src/index';

export function EditorCreationErrorBoundary(props: { onMount: OnMount }) @{
	<>
		@try {
			<Editor path="file:///failing-editor.ts" value="failing" onMount={props.onMount} />
		} @catch (error) {
			<div data-error>{error.message as string}</div>
		}
	</>
}

export function DiffEditorCreationErrorBoundary(props: { onMount: DiffOnMount }) @{
	<>
		@try {
			<DiffEditor
				original="before"
				modified="after"
				originalModelPath="file:///failing-original.ts"
				modifiedModelPath="file:///failing-modified.ts"
				onMount={props.onMount}
			/>
		} @catch (error) {
			<div data-error>{error.message as string}</div>
		}
	</>
}
