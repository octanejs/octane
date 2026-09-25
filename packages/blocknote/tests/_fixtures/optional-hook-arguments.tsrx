import type { BlockNoteEditor, BlockNoteEditorOptions } from '@blocknote/core';
import {
	BlockNoteContext,
	useCreateBlockNote,
	useEditorChange,
	useEditorSelectionChange,
} from '@octanejs/blocknote';

interface OptionalHookArgumentsProps {
	options: Partial<BlockNoteEditorOptions<any, any, any>>;
	editor: BlockNoteEditor<any, any, any>;
	onChange: Parameters<BlockNoteEditor<any, any, any>['onChange']>[0];
	onSelectionChange: () => void;
}

function OptionalHookCalls(props: OptionalHookArgumentsProps) @{
	useCreateBlockNote();
	useCreateBlockNote(props.options);
	useEditorSelectionChange(props.onSelectionChange, props.editor);
	useEditorChange(props.onChange);

	<output />
}

export function OptionalHookArguments(props: OptionalHookArgumentsProps) @{
	<BlockNoteContext value={{ editor: props.editor }}>
		<OptionalHookCalls {...props} />
	</BlockNoteContext>
}
