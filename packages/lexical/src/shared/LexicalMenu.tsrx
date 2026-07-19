// The LexicalMenu component + default renderer, ported from
// @lexical/react/src/shared/LexicalMenu.tsx. A `.tsrx` component (auto-slotted
// hooks). The hooks (useMenuAnchorRef / useDynamicPositioning) + non-component
// pieces live in the sibling `.ts` files.
import type { MenuOption, MenuRef, MenuRenderFn, MenuResolution } from './menuShared';
import {
	$splitNodeContainingQuery,
	scrollIntoViewIfNeeded,
	SCROLL_TYPEAHEAD_OPTION_INTO_VIEW_COMMAND,
} from './menuShared';
import type { CommandListenerPriority, LexicalEditor, TextNode } from 'lexical';
import {
	COMMAND_PRIORITY_LOW,
	KEY_ARROW_DOWN_COMMAND,
	KEY_ARROW_UP_COMMAND,
	KEY_ENTER_COMMAND,
	KEY_ESCAPE_COMMAND,
	KEY_TAB_COMMAND,
	mergeRegister,
} from 'lexical';
import { createPortal, useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'octane';

type MenuItemProps<TOption extends MenuOption> = {
	index: number;
	isSelected: boolean;
	onClick: () => void;
	onMouseEnter: () => void;
	option: TOption;
};

function MenuItem<TOption extends MenuOption>(props: MenuItemProps<TOption>) @{
	<li
		tabIndex={-1}
		class={props.isSelected ? 'item selected' : 'item'}
		ref={props.option.setRefElement}
		role="option"
		aria-selected={props.isSelected ? 'true' : 'false'}
		id={'typeahead-item-' + props.index}
		onMouseEnter={props.onMouseEnter}
		onClick={props.onClick}
	>
		{props.option.icon}
		<span class="text">{props.option.title}</span>
	</li>
}

type DefaultMenuProps<TOption extends MenuOption> = {
	options: TOption[];
	selectedIndex: number | null;
	selectOptionAndCleanUp: (option: TOption) => void;
	setHighlightedIndex: (index: number) => void;
};

function DefaultMenu<TOption extends MenuOption>(props: DefaultMenuProps<TOption>) @{
	<div class="typeahead-popover mentions-menu">
		<ul>{props.options.map(
			(option, i) => <MenuItem
				key={option.key}
				index={i}
				isSelected={props.selectedIndex === i}
				onClick={() => {
					props.setHighlightedIndex(i);
					props.selectOptionAndCleanUp(option);
				}}
				onMouseEnter={() => props.setHighlightedIndex(i)}
				option={option}
			/>,
		)}</ul>
	</div>
}

type LexicalMenuProps<TOption extends MenuOption> = {
	close: () => void;
	editor: LexicalEditor;
	anchorElementRef: MenuRef;
	resolution: MenuResolution;
	options: TOption[];
	shouldSplitNodeWithQuery?: boolean;
	menuRenderFn?: MenuRenderFn<TOption>;
	onSelectOption: (option: TOption, textNodeContainingQuery: | TextNode
	| null, closeMenu: () => void, matchingString: string) => void;
	commandPriority?: CommandListenerPriority;
	preselectFirstItem?: boolean;
};

export function LexicalMenu<TOption extends MenuOption>(props: LexicalMenuProps<TOption>) {
	const close = props.close;
	const editor = props.editor;
	const anchorElementRef = props.anchorElementRef;
	const resolution = props.resolution;
	const options = props.options;
	const menuRenderFnProp = props.menuRenderFn;
	const onSelectOption = props.onSelectOption;
	const shouldSplitNodeWithQuery = props.shouldSplitNodeWithQuery === true;
	const commandPriority =
		props.commandPriority != null ? props.commandPriority : COMMAND_PRIORITY_LOW;
	const preselectFirstItem = props.preselectFirstItem !== false;

	const [rawSelectedIndex, setHighlightedIndex] = useState<number | null>(null);
	const selectedIndex =
		rawSelectedIndex !== null ? Math.min(options.length - 1, rawSelectedIndex) : null;

	const matchingString = resolution.match && resolution.match.matchingString;

	useEffect(() => {
		if (preselectFirstItem) {
			setHighlightedIndex(0);
		}
	}, [matchingString, preselectFirstItem]);

	const selectOptionAndCleanUp = useCallback((selectedEntry: TOption) => {
		editor.update(() => {
			const textNodeContainingQuery =
				resolution.match != null && shouldSplitNodeWithQuery
					? $splitNodeContainingQuery(resolution.match)
					: null;
			onSelectOption(
				selectedEntry,
				textNodeContainingQuery,
				close,
				resolution.match ? resolution.match.matchingString : '',
			);
		});
	}, [editor, shouldSplitNodeWithQuery, resolution.match, onSelectOption, close]);

	const updateSelectedIndex = useCallback((index: number) => {
		const rootElem = editor.getRootElement();
		if (rootElem !== null) {
			rootElem.setAttribute('aria-activedescendant', 'typeahead-item-' + index);
			setHighlightedIndex(index);
		}
	}, [editor]);

	useEffect(() => {
		return () => {
			const rootElem = editor.getRootElement();
			if (rootElem !== null) {
				rootElem.removeAttribute('aria-activedescendant');
			}
		};
	}, [editor]);

	useLayoutEffect(() => {
		if (options === null) {
			setHighlightedIndex(null);
		} else if (selectedIndex === null && preselectFirstItem) {
			updateSelectedIndex(0);
		}
	}, [options, selectedIndex, updateSelectedIndex, preselectFirstItem]);

	useEffect(() => {
		return mergeRegister(
			editor.registerCommand(
				SCROLL_TYPEAHEAD_OPTION_INTO_VIEW_COMMAND,
				({ option }) => {
					if (option.ref && option.ref.current != null) {
						scrollIntoViewIfNeeded(option.ref.current);
						return true;
					}
					return false;
				},
				commandPriority,
			),
		);
	}, [editor, updateSelectedIndex, commandPriority]);

	useEffect(() => {
		return mergeRegister(
			editor.registerCommand(
				KEY_ARROW_DOWN_COMMAND,
				(event) => {
					if (options !== null && options.length) {
						const newSelectedIndex =
							selectedIndex === null
								? 0
								: selectedIndex !== options.length - 1
									? selectedIndex + 1
									: 0;
						updateSelectedIndex(newSelectedIndex);
						const option = options[newSelectedIndex];
						if (!option) {
							updateSelectedIndex(-1);
							event.preventDefault();
							event.stopImmediatePropagation();
							return true;
						}
						if (option.ref && option.ref.current) {
							editor.dispatchCommand(SCROLL_TYPEAHEAD_OPTION_INTO_VIEW_COMMAND, {
								index: newSelectedIndex,
								option,
							});
						}
						event.preventDefault();
						event.stopImmediatePropagation();
					}
					return true;
				},
				commandPriority,
			),
			editor.registerCommand(
				KEY_ARROW_UP_COMMAND,
				(event) => {
					if (options !== null && options.length) {
						const newSelectedIndex =
							selectedIndex === null
								? options.length - 1
								: selectedIndex !== 0
									? selectedIndex - 1
									: options.length - 1;
						updateSelectedIndex(newSelectedIndex);
						const option = options[newSelectedIndex];
						if (!option) {
							updateSelectedIndex(-1);
							event.preventDefault();
							event.stopImmediatePropagation();
							return true;
						}
						if (option.ref && option.ref.current) {
							scrollIntoViewIfNeeded(option.ref.current);
						}
						event.preventDefault();
						event.stopImmediatePropagation();
					}
					return true;
				},
				commandPriority,
			),
			editor.registerCommand(
				KEY_ESCAPE_COMMAND,
				(event) => {
					event.preventDefault();
					event.stopImmediatePropagation();
					close();
					return true;
				},
				commandPriority,
			),
			editor.registerCommand(
				KEY_TAB_COMMAND,
				(event) => {
					if (options === null || selectedIndex === null || options[selectedIndex] == null) {
						return false;
					}
					event.preventDefault();
					event.stopImmediatePropagation();
					selectOptionAndCleanUp(options[selectedIndex]);
					return true;
				},
				commandPriority,
			),
			editor.registerCommand(
				KEY_ENTER_COMMAND,
				(event) => {
					if (
						options === null || selectedIndex === null || options[selectedIndex] == null ||
							event && event.shiftKey
					) {
						return false;
					}
					if (event !== null) {
						event.preventDefault();
						event.stopImmediatePropagation();
					}
					selectOptionAndCleanUp(options[selectedIndex]);
					return true;
				},
				commandPriority,
			),
		);
	}, [
		selectOptionAndCleanUp,
		close,
		editor,
		options,
		selectedIndex,
		updateSelectedIndex,
		commandPriority,
	]);

	const listItemProps = useMemo(
		() => ({ options, selectOptionAndCleanUp, selectedIndex, setHighlightedIndex }),
		[selectOptionAndCleanUp, selectedIndex, options],
	);

	if (anchorElementRef.current === null) {
		return null;
	}
	// A custom menuRenderFn returns a portal directly (React-compatible); the default
	// renders DefaultMenu into the anchor. octane renders a createPortal VALUE at any
	// position, so no host-element wrapper is needed.
	if (menuRenderFnProp != null) {
		return menuRenderFnProp(
			anchorElementRef,
			listItemProps,
			resolution.match ? resolution.match.matchingString : '',
		);
	}
	return options.length
		? createPortal(DefaultMenu, anchorElementRef.current, {
				options,
				selectedIndex,
				selectOptionAndCleanUp,
				setHighlightedIndex,
			})
		: null;
}
