import StarterKit from '@tiptap/starter-kit';
import { expectTypeOf } from 'vitest';

import {
	Editor,
	EditorContent,
	EditorProvider,
	Tiptap,
	useCurrentEditor,
	useEditor,
	useEditorState,
	useTiptap,
	useTiptapState,
} from '../src/index';
import type {
	EditorContainerProps,
	EditorContentProps,
	EditorProviderProps,
	TiptapContentProps,
	TiptapWrapperProps,
	UseEditorOptions,
} from '../src/index';

const checkPublicTypes = () => {
	const options: UseEditorOptions = {
		extensions: [StarterKit],
		content: '<p>Typed</p>',
	};
	const editor = useEditor(options);
	const deferredEditor = useEditor({ ...options, immediatelyRender: false });

	expectTypeOf(editor).toEqualTypeOf<Editor>();
	expectTypeOf(deferredEditor).toEqualTypeOf<Editor | null>();

	const text = useEditorState({
		editor,
		selector: ({ editor: selectedEditor }) => selectedEditor.getText(),
	});
	const deferredText = useEditorState({
		editor: deferredEditor,
		selector: ({ editor: selectedEditor }) => selectedEditor?.getText() ?? 'deferred',
	});
	expectTypeOf(text).toEqualTypeOf<string>();
	expectTypeOf(deferredText).toEqualTypeOf<string | null>();

	expectTypeOf(useCurrentEditor().editor).toEqualTypeOf<Editor | null>();
	expectTypeOf(useTiptap().editor).toEqualTypeOf<Editor>();
	expectTypeOf(
		useTiptapState(({ editor: selectedEditor }) => selectedEditor.getText()),
	).toEqualTypeOf<string>();

	const contentProps: EditorContentProps = {
		editor,
		class: 'editor-shell',
		ref: (element) => {
			expectTypeOf(element).toEqualTypeOf<HTMLDivElement | null>();
		},
	};
	EditorContent(contentProps);

	const providerProps: EditorProviderProps = {
		...options,
		slotBefore: 'before',
		slotAfter: 'after',
		editorContainerProps: { 'aria-label': 'Editor' },
	};
	EditorProvider(providerProps);

	const wrapperWithEditor: TiptapWrapperProps = { editor, children: 'content' };
	const wrapperWithLegacyInstance: TiptapWrapperProps = { instance: editor, children: 'content' };
	const wrapperWithBoth: TiptapWrapperProps = { editor, instance: editor, children: 'content' };
	Tiptap(wrapperWithEditor);
	Tiptap(wrapperWithLegacyInstance);
	Tiptap(wrapperWithBoth);
	Tiptap.Content({ class: 'content' });
	const tiptapContentProps: TiptapContentProps = { class: 'content' };
	const containerProps: EditorContainerProps = { 'aria-label': 'Editor' };
	void tiptapContentProps;
	void containerProps;

	// @ts-expect-error EditorContent always requires the editor, including null while deferred.
	const missingContentEditor: EditorContentProps = {};
	// @ts-expect-error Tiptap.Content always uses the editor supplied by its context.
	Tiptap.Content({ editor });
	// @ts-expect-error Tiptap.Content does not expose the EditorContent ref channel.
	Tiptap.Content({ ref: () => {} });
	// @ts-expect-error EditorProvider container props cannot override its owned editor.
	const conflictingContainer: EditorContainerProps = { editor };
	void missingContentEditor;
	void conflictingContainer;
};

void checkPublicTypes;
