// Ported from @tiptap/react 3.28.0 Context.tsx. Octane contexts intentionally
// have no `.Consumer`; the compatibility component below implements the same
// render-prop contract with useContext instead.
import { isChildrenBlock, useMemo } from 'octane';

import { EditorContext, useCurrentEditor } from './Context';
import { EditorContent } from './EditorContent.tsrx';
import { useEditor } from './useEditor';

export function EditorConsumer(props) {
	const value = useCurrentEditor();
	const children = props.children;

	if (typeof children !== 'function' || isChildrenBlock(children)) {
		throw new TypeError('EditorConsumer expects a function as its only child.');
	}

	return children(value);
}

/**
 * Create an editor and expose it to descendants through the legacy context.
 */
export function EditorProvider(props) @{
	const { children, slotAfter, slotBefore, editorContainerProps = {}, ...editorOptions } = props;
	const editor = useEditor(editorOptions);
	const contextValue = useMemo(() => ({ editor }), [editor]);

	if (!editor) {
		return null;
	}

	<EditorContext.Provider value={contextValue}>
		{slotBefore}
		<EditorConsumer>
			{({ editor: currentEditor }) =>
				<EditorContent editor={currentEditor} {...editorContainerProps} />}
		</EditorConsumer>
		{children}
		{slotAfter}
	</EditorContext.Provider>
}
