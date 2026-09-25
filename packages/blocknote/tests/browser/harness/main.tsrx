import { BlockNoteViewRaw, useCreateBlockNote } from '@octanejs/blocknote';
import { createRoot } from 'octane';

import { schema } from './callout.tsrx';
import { SlashMenu } from './slash-menu.tsrx';

function App() @{
	const editor = useCreateBlockNote({
		schema,
		initialContent: [
			{ type: 'paragraph', content: 'Start' },
			{ type: 'callout', props: { emoji: '🔥' }, content: 'Callout text' },
		],
	});
	Object.assign(window, { editor });

	<BlockNoteViewRaw editor={editor} theme="light" data-ready="true">
		<SlashMenu />
	</BlockNoteViewRaw>
}

createRoot(document.getElementById('root')!).render(App);
