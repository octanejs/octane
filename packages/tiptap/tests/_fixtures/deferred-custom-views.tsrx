import { Node } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import {
	EditorContent,
	NodeViewContent,
	NodeViewWrapper,
	ReactNodeViewRenderer,
	useEditor,
	useEditorState,
} from '@octanejs/tiptap';
import { BubbleMenu } from '@octanejs/tiptap/menus';
import { createContext, useContext, useEffect, useState } from 'octane';

const HydrationTheme = createContext('server');

function HydrationPanelView() @{
	const theme = useContext(HydrationTheme);
	const [clicks, setClicks] = useState(0);

	<NodeViewWrapper as="article" data-hydration-node-view="true">
		<output data-hydration-node-theme="true">{theme}</output>
		<button
			type="button"
			contentEditable={false}
			data-hydration-node-action="true"
			onClick={() => setClicks((current) => current + 1)}
		>
			{'node:' + clicks}
		</button>
		<NodeViewContent as="section" data-hydration-node-content="true" />
	</NodeViewWrapper>
}

const HydrationPanel = Node.create({
	name: 'hydrationPanel',
	group: 'block',
	content: 'inline*',
	defining: true,

	parseHTML() {
		return [{ tag: 'section[data-hydration-panel]' }];
	},

	renderHTML({ HTMLAttributes }) {
		return ['section', { ...HTMLAttributes, 'data-hydration-panel': '' }, 0];
	},

	addNodeView() {
		return ReactNodeViewRenderer(HydrationPanelView, {
			as: 'section',
			className: 'hydration-panel-renderer',
		});
	},
});

const extensions = [StarterKit, HydrationPanel];
const content = {
	type: 'doc',
	content: [
		{
			type: 'hydrationPanel',
			content: [
				{ type: 'text', text: 'Hydrated panel content' },
			],
		},
	],
};
const neverShow = () => false;

export function DeferredCustomViews(props) @{
	const [shellClicks, setShellClicks] = useState(0);
	const [menuClicks, setMenuClicks] = useState(0);
	const editor = useEditor({
		extensions,
		content,
		immediatelyRender: false,
	});
	const editorText = useEditorState({
		editor,
		selector: ({ editor: currentEditor }) => currentEditor?.getText() ?? 'deferred',
	});

	useEffect(() => {
		if (editor) {
			props.onEditor?.(editor);
		}
	}, [editor, props.onEditor]);

	<HydrationTheme.Provider value="hydrated">
		<main id="deferred-custom-views">
			<h1 id="deferred-custom-title">Deferred custom editor</h1>
			<output id="deferred-custom-status">
				{editor ? 'ready' : 'deferred'}
			</output>
			<output id="deferred-custom-text">
				{editorText ?? 'deferred'}
			</output>
			<output id="deferred-shell-clicks">
				{'shell:' + shellClicks}
			</output>
			<output id="deferred-menu-clicks">
				{'menu:' + menuClicks}
			</output>
			<button
				id="deferred-shell-action"
				type="button"
				onClick={() => setShellClicks((current) => current + 1)}
			>
				shell action
			</button>
			@if (editor) {
				<>
					<EditorContent editor={editor} data-hydration-editor-host="true" />
					<BubbleMenu editor={editor} shouldShow={neverShow} ref={props.onMenuRef}>
						<button
							data-hydration-menu-action="true"
							type="button"
							onClick={() => setMenuClicks((current) => current + 1)}
						>{'menu action'}</button>
					</BubbleMenu>
				</>
			}
		</main>
	</HydrationTheme.Provider>
}
