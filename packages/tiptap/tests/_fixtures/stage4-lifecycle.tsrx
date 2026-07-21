import { Editor, Mark, Node } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import {
	EditorContent,
	MarkViewContent,
	NodeViewContent,
	NodeViewWrapper,
	ReactMarkViewRenderer,
	ReactNodeViewRenderer,
} from '@octanejs/tiptap';
import { BubbleMenu } from '@octanejs/tiptap/menus';
import { useEffect, useState } from 'octane';

export function PendingRendererBody(props) @{
	<span data-pending-renderer="true">{props.label as string}</span>
}

export function PendingRendererHost(props) @{
	<section data-pending-renderer-host="true">
		<div
			data-retained-renderer-element="true"
			ref={(element) => {
				if (element && props.rendererElement.parentNode !== element) {
					element.append(props.rendererElement);
				}
			}}
		/>
		<EditorContent editor={props.editor} id="pending-renderer-editor" />
	</section>
}

function SwitchingNodeView(props) @{
	const [clicks, setClicks] = useState(0);
	const owner = props.extension.options.owner;
	const onLifecycle = props.extension.options.onNodeLifecycle;

	useEffect(() => {
		onLifecycle('mount');
		return () => onLifecycle('cleanup');
	}, [onLifecycle]);

	<NodeViewWrapper
		as="article"
		ref={[props.ref, props.extension.options.onNodeRef]}
		data-switching-node="true"
		class={'switching-node-' + owner}
	>
		<output data-switching-node-owner="true">{owner as string}</output>
		<button
			type="button"
			contentEditable={false}
			id={'switching-node-action-' + owner}
			onClick={() => setClicks((current) => current + 1)}
		>
			{'clicks: ' + clicks}
		</button>
		<NodeViewContent id={'switching-node-content-' + owner} />
	</NodeViewWrapper>
}

const SwitchingNode = Node.create({
	name: 'switchingNode',
	group: 'block',
	content: 'inline*',

	addOptions() {
		return {
			owner: 'unknown',
			onNodeLifecycle: () => {},
			onNodeRef: () => {},
		};
	},

	parseHTML() {
		return [{ tag: 'section[data-switching-node-source]' }];
	},

	renderHTML() {
		return ['section', { 'data-switching-node-source': '' }, 0];
	},

	addNodeView() {
		return ReactNodeViewRenderer(SwitchingNodeView, {
			as: 'section',
			className: 'switching-node-renderer',
		});
	},
});

function SwitchingMarkView(props) @{
	const owner = props.extension.options.owner;
	const onLifecycle = props.extension.options.onMarkLifecycle;

	useEffect(() => {
		onLifecycle('mount');
		return () => onLifecycle('cleanup');
	}, [onLifecycle]);

	<span
		ref={[props.ref, props.extension.options.onMarkRef]}
		data-switching-mark="true"
		class={'switching-mark-' + owner}
	>
		<output data-switching-mark-owner="true">{owner as string}</output>
		<MarkViewContent id={'switching-mark-content-' + owner} />
	</span>
}

const SwitchingMark = Mark.create({
	name: 'switchingMark',

	addOptions() {
		return {
			owner: 'unknown',
			onMarkLifecycle: () => {},
			onMarkRef: () => {},
		};
	},

	parseHTML() {
		return [{ tag: 'span[data-switching-mark-source]' }];
	},

	renderHTML() {
		return ['span', { 'data-switching-mark-source': '' }, 0];
	},

	addMarkView() {
		return ReactMarkViewRenderer(SwitchingMarkView, {
			className: 'switching-mark-renderer',
		});
	},
});

export function createSwitchingEditor(options) {
	return new Editor({
		extensions: [
			StarterKit,
			SwitchingNode.configure({
				owner: options.owner,
				onNodeLifecycle: options.onNodeLifecycle,
				onNodeRef: options.onNodeRef,
			}),
			SwitchingMark.configure({
				owner: options.owner,
				onMarkLifecycle: options.onMarkLifecycle,
				onMarkRef: options.onMarkRef,
			}),
		],
		content: {
			type: 'doc',
			content: [
				{
					type: 'switchingNode',
					content: [
						{ type: 'text', text: `${options.owner} node content` },
					],
				},
				{
					type: 'paragraph',
					content: [
						{
							type: 'text',
							text: `${options.owner} marked content`,
							marks: [{ type: 'switchingMark' }],
						},
					],
				},
			],
		},
	});
}

export function SwitchingEditorHost(props) @{
	<section id={'switching-editor-' + props.owner}>
		<EditorContent editor={props.editor} id="switching-editor-content" />
	</section>
}

const neverShow = () => false;

export function SwitchingMenuHost(props) @{
	<section data-switching-menu-host="true">
		<BubbleMenu
			editor={props.editor}
			pluginKey={props.pluginKey}
			appendTo={props.appendTo}
			updateDelay={0}
			shouldShow={neverShow}
			className={'switching-menu-' + props.owner}
			ref={props.menuRef}
		>
			<button
				type="button"
				data-switching-menu-action="true"
				onClick={props.onAction}
			>{props.owner as string}</button>
		</BubbleMenu>
	</section>
}

function AdvancedNodeView(props) @{
	const id = props.node.attrs.id;

	<NodeViewWrapper as="article" data-advanced-view="true" id={'advanced-view-' + id}>
		<output id={'advanced-label-' + id}>{props.node.attrs.label as string}</output>
		<output id={'advanced-position-' + id}>{String(props.getPos())}</output>
		<output id={'advanced-storage-' + id}>{props.extension.storage.version as string}</output>
		<output id={'advanced-revision-' + id}>{String(props.node.attrs.revision)}</output>
		<button
			type="button"
			contentEditable={false}
			id={'advanced-publish-' + id}
			onClick={() => props.updateAttributes({
				label: `${id}-published`,
				publish: true,
			})}
		>
			publish
		</button>
		<button
			type="button"
			contentEditable={false}
			id={'advanced-hold-' + id}
			onClick={() => props.updateAttributes({
				label: `${id}-held`,
				publish: false,
			})}
		>
			hold
		</button>
		<button
			type="button"
			contentEditable={false}
			id={'advanced-release-' + id}
			onClick={() => props.updateAttributes({ publish: true })}
		>
			release
		</button>
		<button
			type="button"
			contentEditable={false}
			id={'advanced-refresh-' + id}
			onClick={() => props.updateAttributes({
				publish: true,
				revision: props.node.attrs.revision + 1,
			})}
		>
			refresh
		</button>
		<NodeViewContent id={'advanced-content-' + id} />
	</NodeViewWrapper>
}

const AdvancedNode = Node.create({
	name: 'advancedNode',
	group: 'block',
	content: 'inline*',

	addStorage() {
		return { version: 'initial' };
	},

	addAttributes() {
		return {
			id: { default: 'unknown' },
			label: {
				default: 'initial',
				renderHTML: (attributes) => ({ 'data-schema-label': attributes.label }),
			},
			publish: { default: true, rendered: false },
			revision: { default: 0, rendered: false },
		};
	},

	parseHTML() {
		return [{ tag: 'section[data-advanced-node-source]' }];
	},

	renderHTML({ HTMLAttributes }) {
		return ['section', { ...HTMLAttributes, 'data-advanced-node-source': '' }, 0];
	},

	addNodeView() {
		return ReactNodeViewRenderer(AdvancedNodeView, {
			as: 'section',
			className: 'advanced-node-renderer',
			trackNodeViewPosition: true,
			attrs: ({ node, HTMLAttributes }) => ({
				'data-advanced-id': node.attrs.id,
				'data-advanced-label': node.attrs.label,
				'data-schema-label': HTMLAttributes['data-schema-label'],
			}),
			update: ({ newNode, updateProps }) => {
				if (newNode.attrs.publish) {
					updateProps();
				}
				return true;
			},
		});
	},
});

export function createAdvancedEditor() {
	return new Editor({
		extensions: [StarterKit, AdvancedNode],
		content: {
			type: 'doc',
			content: [
				{
					type: 'advancedNode',
					attrs: { id: 'one', label: 'one-initial', publish: true, revision: 0 },
					content: [
						{ type: 'text', text: 'one content' },
					],
				},
				{
					type: 'advancedNode',
					attrs: { id: 'two', label: 'two-initial', publish: true, revision: 0 },
					content: [
						{ type: 'text', text: 'two content' },
					],
				},
			],
		},
	});
}

export function AdvancedEditorHost(props) @{
	<section data-advanced-editor-host="true">
		<EditorContent editor={props.editor} id="advanced-editor-content" />
	</section>
}
