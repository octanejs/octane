import type { BlockNoteEditor, BlockNoteEditorOptions } from '@blocknote/core';
import { useCreateBlockNote } from '@octanejs/blocknote';
import type { BlockNoteDependencyList } from '@octanejs/blocknote';

export interface HookArgumentsProps {
	options: Partial<BlockNoteEditorOptions<any, any, any>>;
	capture(defaultEditor: BlockNoteEditor<any, any, any>, configuredEditor: BlockNoteEditor<
		any,
		any,
		any
	>): void;
}

export function HookArguments(props: HookArgumentsProps) @{
	const defaultEditor = useCreateBlockNote();
	const configuredEditor = useCreateBlockNote(props.options);
	props.capture(defaultEditor, configuredEditor);

	<output />
}

export function HookDependencies(props: HookArgumentsProps & {
	dependencies: BlockNoteDependencyList;
}) @{
	const defaultEditor = useCreateBlockNote();
	const configuredEditor = useCreateBlockNote(props.options, props.dependencies);
	props.capture(defaultEditor, configuredEditor);

	<output />
}
