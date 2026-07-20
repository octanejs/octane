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
	useEditorState,
} from '@octanejs/tiptap';
import { createContext, useContext, useEffect, useRef, useState } from 'octane';

const ParityTheme = createContext('day');

function ParityPanelView(props) @{
	const theme = useContext(ParityTheme);
	const [clicks, setClicks] = useState(0);
	const onLifecycle = props.extension.options.onLifecycle;

	useEffect(() => {
		onLifecycle('node:mount');

		return () => onLifecycle('node:cleanup');
	}, [onLifecycle]);

	<NodeViewWrapper data-parity-node-view="true">
		<output data-parity-node-theme="true">{theme}</output>
		<output data-parity-node-label="true">
			{props.node.attrs.label as string}
		</output>
		<output data-parity-node-selection="true">
			{props.selected ? 'selected' : 'unselected'}
		</output>
		<button
			type="button"
			contentEditable={false}
			data-parity-node-increment="true"
			onClick={() => setClicks((current) => current + 1)}
		>
			{'node:' + clicks}
		</button>
		<button
			type="button"
			contentEditable={false}
			data-parity-node-update="true"
			onClick={() => props.updateAttributes({ label: 'updated' })}
		>
			update node
		</button>
		<button
			type="button"
			contentEditable={false}
			data-parity-node-delete="true"
			onClick={() => props.deleteNode()}
		>
			delete node
		</button>
		<NodeViewContent as="section" data-parity-node-content="true" />
	</NodeViewWrapper>
}

const ParityPanel = Node.create({
	name: 'parityPanel',
	group: 'block',
	content: 'inline*',
	defining: true,

	addOptions() {
		return {
			onLifecycle: () => {},
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
		return [{ tag: 'section[data-parity-panel]' }];
	},

	renderHTML({ HTMLAttributes }) {
		return ['section', { ...HTMLAttributes, 'data-parity-panel': '' }, 0];
	},

	addNodeView() {
		return ReactNodeViewRenderer(ParityPanelView, {
			as: 'section',
			className: 'parity-panel-renderer',
			attrs: ({ node }) => ({
				'data-parity-panel-label': node.attrs.label,
			}),
		});
	},
});

function ParityBadgeView(props) @{
	const theme = useContext(ParityTheme);

	<span data-parity-mark-view="true">
		<output data-parity-mark-theme="true">{theme}</output>
		<output data-parity-mark-tone="true">
			{props.mark.attrs.tone as string}
		</output>
		<button
			type="button"
			contentEditable={false}
			data-parity-mark-update="true"
			onClick={() => props.updateAttributes({ tone: 'cool' })}
		>
			update mark
		</button>
		<MarkViewContent as="strong" />
	</span>
}

const ParityBadge = Mark.create({
	name: 'parityBadge',

	addAttributes() {
		return {
			tone: {
				default: 'warm',
			},
		};
	},

	parseHTML() {
		return [{ tag: 'span[data-parity-badge]' }];
	},

	renderHTML({ HTMLAttributes }) {
		return ['span', { ...HTMLAttributes, 'data-parity-badge': '' }, 0];
	},

	addMarkView() {
		return ReactMarkViewRenderer(ParityBadgeView, {
			as: 'span',
			className: 'parity-badge-renderer',
			attrs: {
				'data-parity-badge-shell': 'true',
			},
		});
	},
});

const initialContent = {
	type: 'doc',
	content: [
		{
			type: 'parityPanel',
			attrs: { label: 'initial' },
			content: [
				{ type: 'text', text: 'Editable panel' },
			],
		},
		{
			type: 'paragraph',
			content: [
				{
					type: 'text',
					text: 'Marked text',
					marks: [
						{ type: 'parityBadge', attrs: { tone: 'warm' } },
					],
				},
				{ type: 'text', text: ' tail' },
			],
		},
	],
};

function DirectParityWidget(props) @{
	const theme = useContext(ParityTheme);
	const [clicks, setClicks] = useState(0);

	useEffect(() => {
		props.onLifecycle('renderer:mount');

		return () => props.onLifecycle('renderer:cleanup');
	}, [props.editor, props.onLifecycle]);

	<div data-parity-renderer-view="true">
		<output data-parity-renderer-theme="true">{theme}</output>
		<output data-parity-renderer-label="true">
			{props.label as string}
		</output>
		<button
			type="button"
			data-parity-renderer-increment="true"
			onClick={() => setClicks((current) => current + 1)}
		>
			{'renderer:' + clicks}
		</button>
	</div>
}

function findMarkedRange(editor) {
	let range = null;

	editor.state.doc.descendants((node, position) => {
		if (node.isText && node.marks.some((mark) => mark.type.name === 'parityBadge')) {
			range = { from: position, to: position + node.nodeSize };
		}
	});

	return range;
}

export function CustomViewsParity(props) @{
	const [theme, setTheme] = useState('day');
	const rendererHost = useRef(null);
	const rendererRef = useRef(null);
	const editor = useEditor({
		extensions: [
			StarterKit,
			ParityPanel.configure({ onLifecycle: props.onLifecycle }),
			ParityBadge,
		],
		content: initialContent,
		immediatelyRender: true,
	});
	const editorText = useEditorState({
		editor,
		selector: ({ editor: currentEditor }) => currentEditor?.getText() ?? 'deferred',
	});

	const createRenderer = () => {
		if (!editor || !rendererHost.current || rendererRef.current) {
			return;
		}

		const renderer = new ReactRenderer(DirectParityWidget, {
			editor,
			props: {
				editor,
				label: 'initial',
				onLifecycle: props.onLifecycle,
			},
			as: 'aside',
			className: 'parity-direct-renderer',
		});
		rendererRef.current = renderer;
		rendererHost.current.append(renderer.element);
	};

	const updateRenderer = () => rendererRef.current?.updateProps({ label: 'updated' });
	const destroyRenderer = () => {
		rendererRef.current?.destroy();
		rendererRef.current = null;
	};
	const removeMark = () => {
		if (!editor) {
			return;
		}

		const range = findMarkedRange(editor);
		if (range) {
			editor.chain().setTextSelection(range).unsetMark('parityBadge').run();
		}
	};

	<ParityTheme.Provider value={theme}>
		<section data-custom-views-parity="true">
			<output data-parity-editor-text="true">{editorText ?? 'deferred'}</output>
			<button type="button" data-parity-theme-toggle="true" onClick={() => setTheme('night')}>
				toggle theme
			</button>
			<button
				type="button"
				data-parity-node-select="true"
				onClick={() => editor?.commands.setNodeSelection(0)}
			>
				select node
			</button>
			<button type="button" data-parity-mark-remove="true" onClick={removeMark}>
				remove mark
			</button>
			<button type="button" data-parity-renderer-create="true" onClick={createRenderer}>
				create renderer
			</button>
			<button type="button" data-parity-renderer-update="true" onClick={updateRenderer}>
				update renderer
			</button>
			<button type="button" data-parity-renderer-destroy="true" onClick={destroyRenderer}>
				destroy renderer
			</button>
			<div data-parity-renderer-host="true" ref={rendererHost} />
			@if (editor) {
				<EditorContent editor={editor} data-parity-editor-host="true" />
			}
		</section>
	</ParityTheme.Provider>
}
