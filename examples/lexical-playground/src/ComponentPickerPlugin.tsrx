// A slash-command (`/`) component picker, mirroring lexical-playground's
// ComponentPickerPlugin — built on @octanejs/lexical's typeahead menu (P4).
import { useLexicalComposerContext } from '@octanejs/lexical/LexicalComposerContext';
import {
	LexicalTypeaheadMenuPlugin,
	MenuOption,
	useBasicTypeaheadTriggerMatch,
} from '@octanejs/lexical/LexicalTypeaheadMenuPlugin';
import { INSERT_HORIZONTAL_RULE_COMMAND } from '@octanejs/lexical';
import { $setBlocksType } from '@lexical/selection';
import { $createHeadingNode, $createQuoteNode } from '@lexical/rich-text';
import { INSERT_ORDERED_LIST_COMMAND, INSERT_UNORDERED_LIST_COMMAND } from '@lexical/list';
import { $createParagraphNode, $getSelection, $isRangeSelection } from 'lexical';
import type { ElementNode, TextNode } from 'lexical';
import { createPortal, useCallback, useMemo, useState } from 'octane';

class ComponentPickerOption extends MenuOption {
	title: string;
	onSelect: () => void;
	constructor(title: string, onSelect: () => void) {
		super(title);
		this.title = title;
		this.onSelect = onSelect;
	}
}

type PickerItemProps = {
	options: ComponentPickerOption[];
	selectedIndex: number | null;
	selectOptionAndCleanUp: (option: ComponentPickerOption) => void;
	setHighlightedIndex: (index: number) => void;
};

function ComponentPickerMenu(props: { itemProps: PickerItemProps }) @{
	<div class="typeahead-popover component-picker-menu">
		<ul>{props.itemProps.options.map(
			(option, i) => <li
				key={option.key}
				class={props.itemProps.selectedIndex === i ? 'item selected' : 'item'}
				role="option"
				aria-selected={props.itemProps.selectedIndex === i ? 'true' : 'false'}
				ref={option.setRefElement}
				onMouseEnter={() => props.itemProps.setHighlightedIndex(i)}
				onClick={() => {
					props.itemProps.setHighlightedIndex(i);
					props.itemProps.selectOptionAndCleanUp(option);
				}}
			>
				<span class="text">{option.title}</span>
			</li>,
		)}</ul>
	</div>
}

export function ComponentPickerPlugin() {
	const [editor] = useLexicalComposerContext();
	const [queryString, setQueryString] = useState<string | null>(null);
	const triggerFn = useBasicTypeaheadTriggerMatch('/', { minLength: 0 });

	const options = useMemo(() => {
		const $block = (create: () => ElementNode) => () => {
			const selection = $getSelection();
			if ($isRangeSelection(selection)) {
				$setBlocksType(selection, create);
			}
		};
		const all = [
			new ComponentPickerOption('Paragraph', $block(() => $createParagraphNode())),
			new ComponentPickerOption('Heading 1', $block(() => $createHeadingNode('h1'))),
			new ComponentPickerOption('Heading 2', $block(() => $createHeadingNode('h2'))),
			new ComponentPickerOption('Heading 3', $block(() => $createHeadingNode('h3'))),
			new ComponentPickerOption('Quote', $block(() => $createQuoteNode())),
			new ComponentPickerOption('Bulleted List', () => editor.dispatchCommand(
				INSERT_UNORDERED_LIST_COMMAND,
				undefined,
			)),
			new ComponentPickerOption('Numbered List', () => editor.dispatchCommand(
				INSERT_ORDERED_LIST_COMMAND,
				undefined,
			)),
			new ComponentPickerOption('Divider', () => editor.dispatchCommand(
				INSERT_HORIZONTAL_RULE_COMMAND,
				undefined,
			)),
		];
		if (!queryString) {
			return all;
		}
		const q = queryString.toLowerCase();
		return all.filter((o) => o.title.toLowerCase().includes(q));
	}, [editor, queryString]);

	const onSelectOption = useCallback((
		selectedOption: ComponentPickerOption,
		nodeToRemove: TextNode | null,
		closeMenu: () => void,
	) => {
		editor.update(() => {
			if (nodeToRemove) {
				nodeToRemove.remove();
			}
			selectedOption.onSelect();
			closeMenu();
		});
	}, [editor]);

	// React-compatible: return a portal (octane renders a createPortal value at any
	// position — no host-element wrapper needed).
	const menuRenderFn = (anchorRef: { current: HTMLElement | null }, itemProps: PickerItemProps) => {
		if (anchorRef.current == null || !itemProps.options.length) {
			return null;
		}
		return createPortal(<ComponentPickerMenu itemProps={itemProps} />, anchorRef.current);
	};

	return <LexicalTypeaheadMenuPlugin
		onQueryChange={setQueryString}
		onSelectOption={onSelectOption}
		triggerFn={triggerFn}
		options={options}
		menuRenderFn={menuRenderFn}
	/>;
}
