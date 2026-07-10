import { LexicalComposer } from '@octanejs/lexical/LexicalComposer';
import { RichTextPlugin } from '@octanejs/lexical/LexicalRichTextPlugin';
import { ContentEditable } from '@octanejs/lexical/LexicalContentEditable';
import { LexicalErrorBoundary } from '@octanejs/lexical/LexicalErrorBoundary';
import { LexicalNodeMenuPlugin } from '@octanejs/lexical/LexicalNodeMenuPlugin';
import { useCallback } from 'octane';

// Custom menuRenderFn body — the test's renderFn returns
// createPortal(CustomNodeMenuBody, anchor, { itemProps }).
export function CustomNodeMenuBody(props) @{
	<div class="custom-node-menu" data-testid="custom-node-menu">{props.itemProps.options.map(
		(option, i) => <div
			key={option.key}
			data-selected={props.itemProps.selectedIndex === i ? 'true' : 'false'}
			class="custom-node-menu-item"
		>
			{option.title as string}
		</div>,
	)}</div>
}

function NodeMenuHarness(props) @{
	const onSelectOption = useCallback((_option, _textNode, closeMenu) => {
		closeMenu();
	}, []);
	<LexicalNodeMenuPlugin
		nodeKey={props.nodeKey ?? null}
		onSelectOption={onSelectOption}
		options={props.options}
		menuRenderFn={props.menuRenderFn}
	/>
}

export function NodeMenuEditor(props) @{
	<LexicalComposer
		initialConfig={{
			namespace: 'test-node-menu',
			nodes: [],
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
		<NodeMenuHarness
			nodeKey={props.nodeKey}
			options={props.options}
			menuRenderFn={props.menuRenderFn}
		/>
	</LexicalComposer>
}
