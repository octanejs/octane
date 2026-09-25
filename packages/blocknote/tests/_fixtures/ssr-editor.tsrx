import { BlockNoteViewRaw, useCreateBlockNote } from '@octanejs/blocknote';

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
