import { AutoLinkNode, LinkNode } from '@lexical/link';
import { LexicalComposer } from '@octanejs/lexical/LexicalComposer';
import { RichTextPlugin } from '@octanejs/lexical/LexicalRichTextPlugin';
import { ContentEditable } from '@octanejs/lexical/LexicalContentEditable';
import { LexicalErrorBoundary } from '@octanejs/lexical/LexicalErrorBoundary';
import { EditorRefPlugin } from '@octanejs/lexical/LexicalEditorRefPlugin';
import { AutoLinkPlugin } from '@octanejs/lexical/LexicalAutoLinkPlugin';
import { LexicalAutoEmbedPlugin } from '@octanejs/lexical/LexicalAutoEmbedPlugin';

// The body the test's menuRenderFn portals into the menu anchor:
// createPortal(AutoEmbedMenuBody, anchor, { options }).
export function AutoEmbedMenuBody(props) @{
	<ul data-testid="auto-embed-menu">
		@for (const option of props.options; key option.key) {
			<li>{option.title as string}</li>
		}
	</ul>
}

// The upstream LexicalAutoEmbedPlugin test's App. The test owns the matchers,
// embed configs, getMenuOptions, menuRenderFn and onError.
export function AutoEmbedEditor(props) @{
	<LexicalComposer
		initialConfig={{
			namespace: 'test-auto-embed',
			nodes: [LinkNode, AutoLinkNode],
			onError: props.onError,
			theme: {},
		}}
	>
		<RichTextPlugin
			contentEditable={<ContentEditable />}
			placeholder={null}
			ErrorBoundary={LexicalErrorBoundary}
		/>
		<AutoLinkPlugin matchers={props.matchers} />
		<EditorRefPlugin editorRef={props.editorRef} />
		<LexicalAutoEmbedPlugin
			embedConfigs={props.embedConfigs}
			getMenuOptions={props.getMenuOptions}
			menuRenderFn={props.menuRenderFn}
		/>
	</LexicalComposer>
}
