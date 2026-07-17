import StarterKit from '@tiptap/starter-kit';
import type { ComponentBody } from 'octane';
import { expectTypeOf } from 'vitest';

import {
	Editor,
	EditorContent,
	EditorProvider,
	MarkViewContent,
	NodeViewContent,
	NodeViewWrapper,
	ReactMarkView,
	ReactMarkViewContext,
	ReactMarkViewRenderer,
	ReactNodeView,
	ReactNodeViewContentProvider,
	ReactNodeViewContext,
	ReactNodeViewRenderer,
	ReactRenderer,
	Tiptap,
	useCurrentEditor,
	useEditor,
	useEditorState,
	useReactNodeView,
	useTiptap,
	useTiptapState,
} from '@octanejs/tiptap';
import type {
	EditorContainerProps,
	EditorContentProps,
	EditorProviderProps,
	MarkViewContentProps,
	MarkViewContextProps,
	MarkViewProps,
	MarkViewRenderer,
	NodeViewContentProps,
	NodeViewRenderer,
	NodeViewWrapperProps,
	ReactMarkViewRendererOptions,
	ReactNodeViewContentProviderProps,
	ReactNodeViewContextProps,
	ReactNodeViewProps,
	ReactNodeViewRef,
	ReactNodeViewRendererOptions,
	ReactRendererOptions,
	TiptapContentProps,
	TiptapWrapperProps,
	UseEditorOptions,
} from '@octanejs/tiptap';

interface DirectRendererProps {
	label: string;
	ref?: ReactNodeViewRef<HTMLDivElement> | ((element: HTMLDivElement | null) => void);
}

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

	const directComponent = (() => undefined) as ComponentBody<DirectRendererProps>;
	const rendererOptions: ReactRendererOptions = {
		editor,
		props: { label: 'typed' },
		as: 'aside',
		className: 'typed-renderer',
	};
	const renderer = new ReactRenderer<HTMLDivElement, DirectRendererProps>(
		directComponent,
		rendererOptions,
	);
	expectTypeOf(renderer.element).toEqualTypeOf<HTMLElement>();
	expectTypeOf(renderer.props).toEqualTypeOf<DirectRendererProps>();
	expectTypeOf(renderer.ref).toEqualTypeOf<HTMLDivElement | null>();
	renderer.updateProps({ label: 'updated' });
	renderer.updateAttributes({ 'data-state': 'updated' });
	renderer.destroy();

	const nodeViewComponent = (() => undefined) as ComponentBody<ReactNodeViewProps<HTMLDivElement>>;
	const nodeViewOptions: Partial<ReactNodeViewRendererOptions> = {
		as: 'section',
		className: 'typed-node-view',
		attrs: ({ node }) => ({ 'data-node-type': node.type.name }),
		trackNodeViewPosition: true,
		update({ oldNode, newNode, updateProps }) {
			expectTypeOf(oldNode).toEqualTypeOf(newNode);
			updateProps();
			return oldNode.type === newNode.type;
		},
	};
	const nodeViewRenderer = ReactNodeViewRenderer<HTMLDivElement>(
		nodeViewComponent,
		nodeViewOptions,
	);
	expectTypeOf(nodeViewRenderer).toEqualTypeOf<NodeViewRenderer>();

	const nodeView = null as unknown as ReactNodeView<HTMLDivElement>;
	expectTypeOf(nodeView.dom).toEqualTypeOf<HTMLElement>();
	expectTypeOf(nodeView.contentDOM).toEqualTypeOf<HTMLElement | null>();
	expectTypeOf(nodeView.renderer.ref).toEqualTypeOf<unknown>();

	const nodeRef: ReactNodeViewRef<HTMLDivElement> = { current: null };
	const consumeNodeViewProps = (props: ReactNodeViewProps<HTMLDivElement>) => {
		expectTypeOf(props.ref.current).toEqualTypeOf<HTMLDivElement | null>();
		props.updateAttributes({ typed: true });
		props.deleteNode();
	};
	const wrapperProps: NodeViewWrapperProps = {
		as: 'article',
		ref: nodeRef,
		class: 'typed-wrapper',
	};
	const nodeContentProps: NodeViewContentProps = {
		as: 'section',
		class: 'typed-content',
	};
	NodeViewWrapper(wrapperProps);
	NodeViewContent(nodeContentProps);

	const nodeContext: ReactNodeViewContextProps = useReactNodeView();
	nodeContext.onDragStart?.(new DragEvent('dragstart'));
	nodeContext.nodeViewContentRef?.(document.createElement('div'));
	const nodeProviderProps: ReactNodeViewContentProviderProps = {
		children: 'child',
		content: 'static content',
	};
	ReactNodeViewContentProvider(nodeProviderProps);
	void ReactNodeViewContext;
	void consumeNodeViewProps;

	const markViewComponent = (() => undefined) as ComponentBody<MarkViewProps>;
	const markViewOptions: Partial<ReactMarkViewRendererOptions> = {
		as: 'span',
		className: 'typed-mark-view',
		attrs: { 'data-mark-view': 'typed' },
	};
	const markViewRenderer = ReactMarkViewRenderer(markViewComponent, markViewOptions);
	expectTypeOf(markViewRenderer).toEqualTypeOf<MarkViewRenderer>();

	const markView = null as unknown as ReactMarkView;
	expectTypeOf(markView.dom).toEqualTypeOf<HTMLElement>();
	expectTypeOf(markView.contentDOM).toEqualTypeOf<HTMLElement>();
	const markContentProps: MarkViewContentProps = {
		as: 'strong',
		class: 'typed-mark-content',
	};
	MarkViewContent(markContentProps);
	const markContext: MarkViewContextProps = {
		markViewContentRef: (element) => {
			expectTypeOf(element).toEqualTypeOf<HTMLElement | null>();
		},
	};
	void markContext;
	void ReactMarkViewContext;

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
