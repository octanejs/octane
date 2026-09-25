import type { BlockNoteEditor } from '@blocknote/core';
import { BlockNoteView, useBlockNoteEditor, type BlockNoteViewProps } from '@octanejs/blocknote';
import { useEffect } from 'octane';

type Editor = BlockNoteEditor<any, any, any>;

export interface ViewFixtureProps {
	editor: Editor;
	theme?: BlockNoteViewProps['theme'];
	editable?: boolean;
	renderEditor?: boolean;
	class?: string;
	ref?: { current: HTMLDivElement | null };
	onChange?: Parameters<Editor['onChange']>[0];
	onSelectionChange?: Parameters<Editor['onSelectionChange']>[0];
	captureContext(editor: Editor): void;
}

function ContextProbe(props: { capture(editor: Editor): void }) @{
	const editor = useBlockNoteEditor();

	useEffect(() => props.capture(editor), [editor, props.capture]);

	<span data-context-probe="" />
}

export function ViewFixture(props: ViewFixtureProps) @{
	const { captureContext, ...viewProps } = props;

	<BlockNoteView {...viewProps}>
		<ContextProbe capture={captureContext} />
		<span data-view-child="" />
	</BlockNoteView>
}

export function SsrViewFixture(props: { editor: Editor; theme?: BlockNoteViewProps['theme'] }) @{
	<BlockNoteView editor={props.editor} class="server-view" theme={props.theme}>
		<span data-server-child="">server</span>
	</BlockNoteView>
}
