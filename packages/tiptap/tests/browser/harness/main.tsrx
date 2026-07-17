import StarterKit from '@tiptap/starter-kit';
import {
	Node,
	NodeViewContent,
	NodeViewWrapper,
	ReactNodeViewRenderer,
	Tiptap,
	useEditor,
} from '@octanejs/tiptap';
import { BubbleMenu, FloatingMenu } from '@octanejs/tiptap/menus';
import { createRoot, delegateEvents, useState } from 'octane';

delegateEvents(['dragstart', 'dragover', 'drop']);

function DraggableCardView(props) @{
	<NodeViewWrapper as="article" class="draggable-card" data-card-label={props.node.attrs.label}>
		<span
			class="drag-handle"
			data-drag-handle="true"
			draggable={true}
			contentEditable={false}
			aria-label={'Drag ' + props.node.attrs.label}
		>
			⋮⋮
		</span>
		<NodeViewContent as="div" class="card-content" />
	</NodeViewWrapper>
}

const DraggableCard = Node.create({
	name: 'draggableCard',
	group: 'block',
	content: 'inline*',
	draggable: true,
	selectable: true,

	addAttributes() {
		return {
			label: {
				default: 'card',
			},
		};
	},

	parseHTML() {
		return [{ tag: 'div[data-draggable-card]' }];
	},

	renderHTML({ node, HTMLAttributes }) {
		return [
			'div',
			{
				...HTMLAttributes,
				'data-draggable-card': node.attrs.label,
			},
			0,
		];
	},

	addNodeView() {
		return ReactNodeViewRenderer(DraggableCardView);
	},
});

const initialContent = {
	type: 'doc',
	content: [
		{
			type: 'paragraph',
			content: [
				{ type: 'text', text: 'Select this text and keep typing' },
			],
		},
		{
			type: 'draggableCard',
			attrs: { label: 'first card' },
			content: [
				{ type: 'text', text: 'First draggable card' },
			],
		},
		{
			type: 'draggableCard',
			attrs: { label: 'second card' },
			content: [
				{ type: 'text', text: 'Second draggable card' },
			],
		},
		{ type: 'paragraph' },
	],
};

function BrowserHarness() @{
	const [droppedText, setDroppedText] = useState('waiting for a drop');
	const [droppedTypes, setDroppedTypes] = useState('');
	const editor = useEditor({
		extensions: [StarterKit, DraggableCard],
		content: initialContent,
		immediatelyRender: true,
	});

	<main>
		@if (editor) {
			<section class="editor-shell" data-editor-ready="true">
				<Tiptap editor={editor}>
					<Tiptap.Content class="editor-host" aria-label="TipTap browser editor" />
					<BubbleMenu
						editor={null}
						updateDelay={0}
						resizeDelay={0}
						data-browser-menu="bubble"
						aria-label="Selection tools"
					>
						selection tools
					</BubbleMenu>
					<FloatingMenu
						editor={null}
						updateDelay={0}
						resizeDelay={0}
						data-browser-menu="floating"
						aria-label="Empty paragraph tools"
					>
						empty paragraph tools
					</FloatingMenu>
				</Tiptap>
			</section>
		}

		<section
			id="drop-target"
			aria-label="Card drop target"
			onDragOver={(event) => event.preventDefault()}
			onDrop={(event) => {
				event.preventDefault();
				const dataTransfer = event.dataTransfer;
				const plainText = dataTransfer?.getData('text/plain').trim() || '';
				const html = dataTransfer?.getData('text/html') || '';
				const htmlContainer = document.createElement('div');
				htmlContainer.innerHTML = html;
				setDroppedText(plainText || htmlContainer.textContent?.trim() || 'missing drag text');
				setDroppedTypes(Array.from(dataTransfer?.types || []).sort().join(','));
			}}
		>
			Drop a card here
			<output id="drop-result" data-transfer-types={droppedTypes}>{droppedText}</output>
		</section>
	</main>
}

const rootElement = document.getElementById('root');
if (!rootElement) {
	throw new Error('Missing #root');
}

createRoot(rootElement).render(BrowserHarness);
