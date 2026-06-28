// Ported from @lexical/react/src/LexicalComposer.tsx. Creates a LexicalEditor from
// initialConfig once (useMemo), seeds its initial state, provides it via context,
// and renders children. `useLayoutEffect` applies the editable flag on mount.
import { createLexicalComposerContext, LexicalComposerContext } from './LexicalComposerContext';
import {
	$createParagraphNode,
	$getRoot,
	$getSelection,
	CAN_USE_DOM,
	createEditor,
	getActiveElement,
	HISTORY_MERGE_TAG,
} from 'lexical';
import { useMemo, useLayoutEffect } from 'octane';

const HISTORY_MERGE_OPTIONS = { tag: HISTORY_MERGE_TAG };

function initializeEditor(editor, initialEditorState) {
	if (initialEditorState === null) {
		return;
	} else if (initialEditorState === undefined) {
		editor.update(() => {
			const root = $getRoot();
			if (root.isEmpty()) {
				const paragraph = $createParagraphNode();
				root.append(paragraph);
				const rootElement = editor.getRootElement();
				// getActiveElement (not document.activeElement) reports the shadow host
				// when the editor lives in a shadow root.
				const activeElement =
					CAN_USE_DOM && rootElement !== null ? getActiveElement(rootElement) : null;
				if ($getSelection() !== null || activeElement !== null && activeElement === rootElement) {
					paragraph.select();
				}
			}
		}, HISTORY_MERGE_OPTIONS);
	} else if (initialEditorState !== null) {
		switch (typeof initialEditorState) {
			case 'string': {
				const parsedEditorState = editor.parseEditorState(initialEditorState);
				editor.setEditorState(parsedEditorState, HISTORY_MERGE_OPTIONS);
				break;
			}
			case 'object': {
				editor.setEditorState(initialEditorState, HISTORY_MERGE_OPTIONS);
				break;
			}
			case 'function': {
				editor.update(() => {
					const root = $getRoot();
					if (root.isEmpty()) {
						initialEditorState(editor);
					}
				}, HISTORY_MERGE_OPTIONS);
				break;
			}
		}
	}
}

export function LexicalComposer(props) @{
	const initialConfig = props.initialConfig;

	const composerContext = useMemo(() => {
		const {
			theme,
			namespace,
			nodes,
			onError,
			onWarn,
			editorState: initialEditorState,
			html,
		} = initialConfig;

		const context = createLexicalComposerContext(null, theme);

		const editor = createEditor({
			editable: initialConfig.editable,
			html,
			namespace,
			nodes,
			onError: (error) => onError(error, editor),
			...(onWarn ? { onWarn: (error) => onWarn(error, editor) } : {}),
			theme,
		});
		initializeEditor(editor, initialEditorState);

		return [editor, context];
	}, []);

	useLayoutEffect(() => {
		const isEditable = initialConfig.editable;
		const [editor] = composerContext;
		editor.setEditable(isEditable !== undefined ? isEditable : true);
	}, []);

	<LexicalComposerContext.Provider
		value={composerContext}
	>{props.children}</LexicalComposerContext.Provider>
}
