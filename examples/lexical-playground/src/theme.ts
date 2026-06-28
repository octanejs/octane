import type { EditorThemeClasses } from 'lexical';

// Lexical playground theme (node type → CSS class), from
// facebook/lexical/packages/lexical-playground/src/themes/PlaygroundEditorTheme.ts
// (trimmed to the node types this example registers). styles.css targets these.
export const theme: EditorThemeClasses = {
	code: 'PlaygroundEditorTheme__code',
	hashtag: 'PlaygroundEditorTheme__hashtag',
	heading: {
		h1: 'PlaygroundEditorTheme__h1',
		h2: 'PlaygroundEditorTheme__h2',
		h3: 'PlaygroundEditorTheme__h3',
		h4: 'PlaygroundEditorTheme__h4',
		h5: 'PlaygroundEditorTheme__h5',
		h6: 'PlaygroundEditorTheme__h6',
	},
	hr: 'PlaygroundEditorTheme__hr',
	hrSelected: 'PlaygroundEditorTheme__hrSelected',
	link: 'PlaygroundEditorTheme__link',
	list: {
		checklist: 'PlaygroundEditorTheme__checklist',
		listitem: 'PlaygroundEditorTheme__listItem',
		listitemChecked: 'PlaygroundEditorTheme__listItemChecked',
		listitemUnchecked: 'PlaygroundEditorTheme__listItemUnchecked',
		nested: {
			listitem: 'PlaygroundEditorTheme__nestedListItem',
		},
		olDepth: [
			'PlaygroundEditorTheme__ol1',
			'PlaygroundEditorTheme__ol2',
			'PlaygroundEditorTheme__ol3',
			'PlaygroundEditorTheme__ol4',
			'PlaygroundEditorTheme__ol5',
		],
		ul: 'PlaygroundEditorTheme__ul',
	},
	paragraph: 'PlaygroundEditorTheme__paragraph',
	quote: 'PlaygroundEditorTheme__quote',
	tab: 'PlaygroundEditorTheme__tabNode',
	text: {
		bold: 'PlaygroundEditorTheme__textBold',
		code: 'PlaygroundEditorTheme__textCode',
		italic: 'PlaygroundEditorTheme__textItalic',
		strikethrough: 'PlaygroundEditorTheme__textStrikethrough',
		subscript: 'PlaygroundEditorTheme__textSubscript',
		superscript: 'PlaygroundEditorTheme__textSuperscript',
		underline: 'PlaygroundEditorTheme__textUnderline',
		underlineStrikethrough: 'PlaygroundEditorTheme__textUnderlineStrikethrough',
	},
};
