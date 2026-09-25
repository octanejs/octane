import { BlockNoteViewRaw, useCreateBlockNote } from '@octanejs/blocknote';
import { createElement, type OctaneNode } from 'octane';

function EditorToolbar() @{
	<aside>Editor tools</aside>
}

function EditorShell(props: { children?: OctaneNode }) {
	return createElement(
		'section',
		{ id: 'editor-shell' },
		createElement(EditorToolbar),
		props.children,
	);
}

export function DescriptorSsrEditor(props: { text: string }) @{
	<EditorShell>
		<SsrEditor text={props.text} />
	</EditorShell>
}

export function SsrEditor(props: { text: string }) @{
	const editor = useCreateBlockNote({
		initialContent: [
			{ type: 'paragraph', content: props.text },
		],
	});

	<main id="ssr-editor">
		<BlockNoteViewRaw editor={editor} />
	</main>
}
