import type { BlockNoteEditor } from '@blocknote/core';
import { BlockNoteViewEditor, BlockNoteViewRaw, useBlockNoteEditor } from '@octanejs/blocknote';

export interface HeadlessViewProps {
	editor: BlockNoteEditor<any, any, any>;
	editable?: boolean;
	theme?: 'light' | 'dark';
	className?: string;
	renderEditor?: boolean;
	onChange?: () => void;
}

function EditorProbe() @{
	const editor = useBlockNoteEditor();
	<output data-probe={editor.document.length} />
}

export function HeadlessView(props: HeadlessViewProps) @{
	<BlockNoteViewRaw
		editor={props.editor}
		editable={props.editable}
		theme={props.theme}
		className={props.className}
		renderEditor={props.renderEditor}
		onChange={props.onChange}
		data-testid="view"
	>
		<EditorProbe />
	</BlockNoteViewRaw>
}

export function SplitView(props: HeadlessViewProps) @{
	<BlockNoteViewRaw editor={props.editor} renderEditor={false} theme="light">
		<section class="toolbar" />
		<BlockNoteViewEditor />
	</BlockNoteViewRaw>
}
