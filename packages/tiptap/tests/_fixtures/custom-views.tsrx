import { Mark, Node } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import {
	EditorContent,
	MarkViewContent,
	NodeViewContent,
	NodeViewWrapper,
	ReactMarkViewRenderer,
	ReactNodeViewRenderer,
	ReactRenderer,
	useEditor,
} from '@octanejs/tiptap';
import { createContext, useContext, useEffect, useRef, useState } from 'octane';

const ViewTheme = createContext('day');

function PanelNodeView(props) @{
	const theme = useContext(ViewTheme);
	const [clicks, setClicks] = useState(0);
	const onLifecycle = props.extension.options.onLifecycle;

	useEffect(() => {
		onLifecycle('mount');

		return () => onLifecycle('cleanup');
	}, [onLifecycle]);

	<NodeViewWrapper
		as="article"
		ref={[props.ref, props.extension.options.onRef]}
		data-panel-node-view="true"
		class="panel-node-view"
	>
		<output data-node-theme="true">{theme}</output>
		<output data-node-label="true">{props.node.attrs.label as string}</output>
		<output data-node-selected="true">
			{props.selected ? 'selected' : 'unselected'}
		</output>
		<button
			type="button"
			contentEditable={false}
			data-node-increment="true"
			onClick={() => setClicks((current) => current + 1)}
		>
			{'node clicks: ' + clicks}
		</button>
		<button
			type="button"
			contentEditable={false}
			data-node-update="true"
			onClick={() => props.updateAttributes({ label: 'updated' })}
		>
			update node
		</button>
		<button
			type="button"
			contentEditable={false}
			data-node-delete="true"
			onClick={() => props.deleteNode()}
		>
			delete node
		</button>
		<NodeViewContent as="section" class="panel-node-content" />
	</NodeViewWrapper>
}

const PanelNode = Node.create({
	name: 'panelNode',
	group: 'block',
	content: 'inline*',
	defining: true,

	addOptions() {
		return {
			onLifecycle: () => {},
			onRef: () => {},
		};
	},

	addAttributes() {
		return {
			label: {
				default: 'initial',
			},
		};
	},

	parseHTML() {
		return [{ tag: 'section[data-panel-node]' }];
	},

	renderHTML({ HTMLAttributes }) {
		return ['section', { ...HTMLAttributes, 'data-panel-node': '' }, 0];
	},

	addNodeView() {
		return ReactNodeViewRenderer(PanelNodeView, {
			as: 'section',
			className: 'panel-node-renderer',
			attrs: ({ node }) => ({
				'data-panel-label': node.attrs.label,
				'data-panel-shell': 'true',
			}),
		});
	},
});

function BadgeMarkView(props) @{
	const theme = useContext(ViewTheme);
	const onLifecycle = props.extension.options.onLifecycle;

	useEffect(() => {
		onLifecycle('mount');

		return () => onLifecycle('cleanup');
	}, [onLifecycle]);

	<span
		ref={[props.ref, props.extension.options.onRef]}
		data-badge-mark-view="true"
		class="badge-mark-view"
	>
		<output data-mark-theme="true">{theme}</output>
		<output data-mark-tone="true">{props.mark.attrs.tone as string}</output>
		<MarkViewContent as="strong" class="badge-mark-content" />
	</span>
}

const BadgeMark = Mark.create({
	name: 'badgeMark',

	addOptions() {
		return {
			onLifecycle: () => {},
			onRef: () => {},
		};
	},

	addAttributes() {
		return {
			tone: {
				default: 'warm',
			},
		};
	},

	parseHTML() {
		return [{ tag: 'span[data-badge-mark]' }];
	},

	renderHTML({ HTMLAttributes }) {
		return ['span', { ...HTMLAttributes, 'data-badge-mark': '' }, 0];
	},

	addMarkView() {
		return ReactMarkViewRenderer(BadgeMarkView, {
			as: 'span',
			className: 'badge-mark-renderer',
			attrs: {
				'data-badge-shell': 'true',
			},
		});
	},
});

const initialContent = {
	type: 'doc',
	content: [
		{
			type: 'panelNode',
			attrs: { label: 'initial' },
			content: [
				{ type: 'text', text: 'Editable panel content' },
			],
		},
		{
			type: 'paragraph',
			content: [
				{
					type: 'text',
					text: 'Marked text',
					marks: [
						{ type: 'badgeMark', attrs: { tone: 'warm' } },
					],
				},
				{ type: 'text', text: ' tail' },
			],
		},
	],
};

function DirectWidget(props) @{
	const theme = useContext(ViewTheme);
	const [clicks, setClicks] = useState(0);

	useEffect(() => {
		props.onLifecycle('mount');

		return () => props.onLifecycle('cleanup');
	}, [props.onLifecycle]);

	<div ref={props.ref} data-direct-widget="true">
		<output data-direct-theme="true">{theme}</output>
		<output data-direct-label="true">{props.label as string}</output>
		<button
			type="button"
			data-direct-increment="true"
			onClick={() => setClicks((current) => current + 1)}
		>
			{'renderer clicks: ' + clicks}
		</button>
	</div>
}

export function CustomViewsEditor(props) @{
	const rendererHost = useRef(null);
	const rendererRef = useRef(null);
	const editor = useEditor({
		extensions: [
			StarterKit,
			PanelNode.configure({
				onLifecycle: props.onNodeLifecycle,
				onRef: props.onNodeRef,
			}),
			BadgeMark.configure({
				onLifecycle: props.onMarkLifecycle,
				onRef: props.onMarkRef,
			}),
		],
		content: initialContent,
		immediatelyRender: true,
	});

	useEffect(() => {
		if (editor) {
			props.onEditor(editor);
		}
	}, [editor, props.onEditor]);

	const createRenderer = () => {
		if (!editor || !rendererHost.current) {
			return;
		}

		rendererRef.current?.destroy();
		const renderer = new ReactRenderer(DirectWidget, {
			editor,
			props: {
				label: 'initial',
				onLifecycle: props.onDirectLifecycle,
			},
			as: 'aside',
			className: 'direct-renderer custom-shell',
		});

		rendererRef.current = renderer;
		rendererHost.current.append(renderer.element);
		props.onRenderer(renderer);
	};

	<ViewTheme.Provider value={props.theme}>
		<section data-custom-views-fixture="true">
			<button type="button" data-create-renderer="true" onClick={createRenderer}>
				create renderer
			</button>
			<div data-direct-renderer-host="true" ref={rendererHost} />
			@if (editor) {
				<EditorContent editor={editor} data-editor-host="custom-views" />
			}
		</section>
	</ViewTheme.Provider>
}
