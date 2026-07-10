import { LexicalComposer } from '@octanejs/lexical/LexicalComposer';
import { RichTextPlugin } from '@octanejs/lexical/LexicalRichTextPlugin';
import { ContentEditable } from '@octanejs/lexical/LexicalContentEditable';
import { LexicalErrorBoundary } from '@octanejs/lexical/LexicalErrorBoundary';
import { EditorRefPlugin } from '@octanejs/lexical/LexicalEditorRefPlugin';
import {
	LexicalTypeaheadMenuPlugin,
	useBasicTypeaheadTriggerMatch,
} from '@octanejs/lexical/LexicalTypeaheadMenuPlugin';
import { useCallback } from 'octane';

// Custom menuRenderFn body — the test's renderFn returns
// createPortal(CustomTypeaheadBody, anchor, { itemProps, matchingString }).
export function CustomTypeaheadBody(props) @{
	<div class="custom-typeahead-menu" data-testid="custom-typeahead">
		<ul>{props.itemProps.options.map(
			(option, i) => <li
				key={option.key}
				data-selected={props.itemProps.selectedIndex === i ? 'true' : 'false'}
				class="custom-item"
			>
				{option.title as string}
			</li>,
		)}</ul>
		{props.matchingString != null
			? <span data-testid="matching-string">
					{props.matchingString as string}
				</span>
			: null}
	</div>
}

// Mirrors the upstream Harness — the '/' trigger hook must be called inside a
// component, so it lives here rather than in the test.
function Harness(props) @{
	const checkForTriggerMatch = useBasicTypeaheadTriggerMatch('/', { minLength: 0 });
	const onSelectOption = useCallback((_option, _nodeToRemove, closeMenu) => {
		closeMenu();
	}, []);
	<LexicalTypeaheadMenuPlugin
		onQueryChange={props.onQueryChange}
		onSelectOption={onSelectOption}
		triggerFn={checkForTriggerMatch}
		options={props.options}
		menuRenderFn={props.menuRenderFn}
		onOpen={props.onOpen}
		onClose={props.onClose}
	/>
}

export function TypeaheadEditor(props) @{
	<LexicalComposer
		initialConfig={{
			namespace: 'test-typeahead',
			nodes: props.nodes ?? [],
			onError: (err) => {
				throw err;
			},
			theme: {},
		}}
	>
		<RichTextPlugin
			contentEditable={<ContentEditable />}
			placeholder={null}
			ErrorBoundary={LexicalErrorBoundary}
		/>
		<EditorRefPlugin editorRef={props.editorRef} />
		<Harness
			onQueryChange={props.onQueryChange}
			options={props.options}
			menuRenderFn={props.menuRenderFn}
			onClose={props.onClose}
		/>
	</LexicalComposer>
}
