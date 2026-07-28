/** @jsxImportSource octane */
import StarterKit from '@tiptap/starter-kit';
import { useEditor } from '@octanejs/tiptap';
import { createRoot, delegateEvents } from 'octane';
import { EditorModeSwitch } from './editor-mode-switch.tsx';

delegateEvents(['click']);

function EditorSwitchHarness() {
	const editor = useEditor({
		extensions: [StarterKit],
		content: '<p>Switchable editor</p>',
		immediatelyRender: true,
	});

	return editor ? <EditorModeSwitch editor={editor} /> : null;
}

const rootElement = document.getElementById('root');
if (!rootElement) {
	throw new Error('Missing #root');
}

createRoot(rootElement).render(EditorSwitchHarness);
