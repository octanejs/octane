import { LexicalComposer } from '@octanejs/lexical/LexicalComposer';
import { RichTextPlugin } from '@octanejs/lexical/LexicalRichTextPlugin';
import { ContentEditable } from '@octanejs/lexical/LexicalContentEditable';
import { LexicalErrorBoundary } from '@octanejs/lexical/LexicalErrorBoundary';
import { EditorRefPlugin } from '@octanejs/lexical/LexicalEditorRefPlugin';
import { DraggableBlockPlugin_EXPERIMENTAL } from '@octanejs/lexical/LexicalDraggableBlockPlugin';
import { useRef } from 'octane';

export const MENU_CLASS = 'draggable-block-menu';
export const TARGET_LINE_CLASS = 'draggable-block-target-line';

function isOnMenu(element) {
	return element.closest('.' + MENU_CLASS) !== null;
}

// The upstream Test / ReadOnlyTest harness: `editable` seeds the composer's
// initial editable flag, and the plugin portals into the test's anchorElem.
export function DraggableBlockEditor(props) @{
	const menuRef = useRef(null);
	const targetLineRef = useRef(null);

	<LexicalComposer
		initialConfig={{
			editable: props.editable ?? true,
			namespace: 'draggable-block',
			onError: (error) => {
				throw error;
			},
		}}
	>
		<EditorRefPlugin editorRef={props.editorRef} />
		<RichTextPlugin contentEditable={<ContentEditable />} ErrorBoundary={LexicalErrorBoundary} />
		<DraggableBlockPlugin_EXPERIMENTAL
			anchorElem={props.anchorElem}
			menuRef={menuRef}
			targetLineRef={targetLineRef}
			menuComponent={<div ref={menuRef} class={MENU_CLASS} />}
			targetLineComponent={<div ref={targetLineRef} class={TARGET_LINE_CLASS} />}
			isOnMenu={isOnMenu}
		/>
	</LexicalComposer>
}
