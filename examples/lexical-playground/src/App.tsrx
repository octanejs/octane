// The octane counterpart of lexical-playground's App/Editor: a LexicalComposer with
// the rich-text editor + the P1–P3 plugin set, styled with the playground theme.
import { LexicalComposer } from '@octanejs/lexical/LexicalComposer';
import { RichTextPlugin } from '@octanejs/lexical/LexicalRichTextPlugin';
import { ContentEditable } from '@octanejs/lexical/LexicalContentEditable';
import { LexicalErrorBoundary } from '@octanejs/lexical/LexicalErrorBoundary';
import { HistoryPlugin } from '@octanejs/lexical/LexicalHistoryPlugin';
import { ListPlugin } from '@octanejs/lexical/LexicalListPlugin';
import { CheckListPlugin } from '@octanejs/lexical/LexicalCheckListPlugin';
import { LinkPlugin } from '@octanejs/lexical/LexicalLinkPlugin';
import { HashtagPlugin } from '@octanejs/lexical/LexicalHashtagPlugin';
import { TabIndentationPlugin } from '@octanejs/lexical/LexicalTabIndentationPlugin';
import { MarkdownShortcutPlugin } from '@octanejs/lexical/LexicalMarkdownShortcutPlugin';
import { HorizontalRulePlugin } from '@octanejs/lexical/LexicalHorizontalRulePlugin';
import { AutoFocusPlugin } from '@octanejs/lexical/LexicalAutoFocusPlugin';
import { ToolbarPlugin } from './ToolbarPlugin.tsrx';
import { ComponentPickerPlugin } from './ComponentPickerPlugin.tsrx';
import { theme } from './theme';
import { EDITOR_NODES } from './nodes';

function placeholder() {
	return <div class="editor-placeholder">Enter some rich text…</div>;
}

export function App() @{
	<div class="app">
		<header class="app-header">
			<h1>
				Lexical Playground
				<span class="badge">octane</span>
			</h1>
			<p>
				The same Lexical editor as facebook/lexical's playground, running on octane via
				@octanejs/lexical.
			</p>
		</header>
		<LexicalComposer
			initialConfig={{
				namespace: 'OctaneLexicalPlayground',
				theme,
				nodes: EDITOR_NODES,
				onError: (error) => {
					throw error;
				},
			}}
		>
			<div class="editor-shell">
				<ToolbarPlugin />
				<div class="editor-container">
					<RichTextPlugin
						contentEditable={<div class="editor-scroller">
							<div class="editor">
								<ContentEditable
									aria-label="Rich text editor"
									class="ContentEditable__root"
									placeholder={placeholder}
								/>
							</div>
						</div>}
						ErrorBoundary={LexicalErrorBoundary}
					/>
					<HistoryPlugin />
					<ListPlugin />
					<CheckListPlugin />
					<LinkPlugin />
					<HashtagPlugin />
					<TabIndentationPlugin />
					<HorizontalRulePlugin />
					<MarkdownShortcutPlugin />
					<AutoFocusPlugin />
					<ComponentPickerPlugin />
				</div>
			</div>
		</LexicalComposer>
	</div>
}
