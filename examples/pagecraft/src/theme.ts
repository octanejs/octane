import type { EditorThemeClasses } from 'lexical';

export const pagecraftTheme: EditorThemeClasses = {
	heading: {
		h1: 'editor-heading-h1',
		h2: 'editor-heading-h2',
		h3: 'editor-heading-h3',
	},
	list: {
		listitem: 'editor-list-item',
		nested: { listitem: 'editor-nested-list-item' },
		olDepth: ['editor-list-ol'],
		ul: 'editor-list-ul',
	},
	paragraph: 'editor-paragraph',
	quote: 'editor-quote',
	text: {
		bold: 'editor-text-bold',
		italic: 'editor-text-italic',
		underline: 'editor-text-underline',
	},
};
