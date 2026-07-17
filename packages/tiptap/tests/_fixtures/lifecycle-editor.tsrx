import StarterKit from '@tiptap/starter-kit';
import { useEditor } from '@octanejs/tiptap';
import { useEffect } from 'octane';

const extensions = [StarterKit];

export function LifecycleEditor(props) @{
	const editor = useEditor(
		{
			extensions,
			content: '<p>Lifecycle</p>',
			immediatelyRender: true,
			onDestroy: () => props.onDestroy(props.label),
			onMount: () => props.onMount(props.label),
			onUnmount: () => props.onUnmount(props.label),
			onUpdate: ({ editor: currentEditor }) => props.onUpdate(props.label, currentEditor.getText()),
		},
		[props.dependency],
	);

	useEffect(() => {
		props.onEditor(editor);
	}, [editor, props.onEditor]);

	<div data-editor-status={editor ? 'ready' : 'deferred'} />
}
