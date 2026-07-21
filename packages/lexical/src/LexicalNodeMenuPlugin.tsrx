// Ported from @lexical/react/src/LexicalNodeMenuPlugin.tsx — a floating menu
// anchored to a specific node (the node-anchored counterpart of the typeahead).
import { useLexicalComposerContext } from './LexicalComposerContext';
import { LexicalMenu } from './shared/LexicalMenu.tsrx';
import { useMenuAnchorRef } from './shared/useMenuAnchorRef';
import { $getNodeByKey, COMMAND_PRIORITY_LOW } from 'lexical';
import type { CommandListenerPriority, NodeKey, TextNode } from 'lexical';
import { startTransition, useCallback, useEffect, useState } from 'octane';
import type { MenuOption, MenuRenderFn, MenuResolution } from './shared/menuShared';

export { MenuOption } from './shared/menuShared';

/**
 * Props for the {@link LexicalNodeMenuPlugin} component.
 */
export type NodeMenuPluginProps<TOption extends MenuOption> = {
	onSelectOption: (option: TOption, textNodeContainingQuery: | TextNode
	| null, closeMenu: () => void, matchingString: string) => void;
	options: TOption[];
	nodeKey: NodeKey | null;
	menuRenderFn?: MenuRenderFn<TOption>;
	onClose?: () => void;
	onOpen?: (resolution: MenuResolution) => void;
	anchorClassName?: string;
	commandPriority?: CommandListenerPriority;
	parent?: HTMLElement;
};

export function LexicalNodeMenuPlugin<TOption extends MenuOption>(
	props: NodeMenuPluginProps<TOption>,
) {
	const options = props.options;
	const nodeKey = props.nodeKey;
	const onClose = props.onClose;
	const onOpen = props.onOpen;
	const onSelectOption = props.onSelectOption;
	const menuRenderFn = props.menuRenderFn;
	const anchorClassName = props.anchorClassName;
	const commandPriority =
		props.commandPriority != null ? props.commandPriority : COMMAND_PRIORITY_LOW;
	const parent = props.parent;

	const [editor] = useLexicalComposerContext();
	const [resolution, setResolution] = useState<MenuResolution | null>(null);
	const anchorElementRef = useMenuAnchorRef(resolution, setResolution, anchorClassName, parent);

	const closeNodeMenu = useCallback(() => {
		setResolution(null);
		if (onClose != null && resolution !== null) {
			onClose();
		}
	}, [onClose, resolution]);

	const openNodeMenu = useCallback((res: MenuResolution) => {
		setResolution(res);
		if (onOpen != null && resolution === null) {
			onOpen(res);
		}
	}, [onOpen, resolution]);

	const positionOrCloseMenu = useCallback(() => {
		if (nodeKey) {
			editor.update(() => {
				const node = $getNodeByKey(nodeKey);
				const domElement = editor.getElementByKey(nodeKey);
				if (node != null && domElement != null) {
					if (resolution == null) {
						startTransition(
							() => openNodeMenu({ getRect: () => domElement.getBoundingClientRect() }),
						);
					}
				}
			});
		} else if (nodeKey == null && resolution != null) {
			closeNodeMenu();
		}
	}, [closeNodeMenu, editor, nodeKey, openNodeMenu, resolution]);

	useEffect(() => {
		positionOrCloseMenu();
	}, [positionOrCloseMenu, nodeKey]);

	useEffect(() => {
		if (nodeKey != null) {
			return editor.registerUpdateListener(({ dirtyElements }) => {
				if (dirtyElements.get(nodeKey)) {
					positionOrCloseMenu();
				}
			});
		}
	}, [editor, positionOrCloseMenu, nodeKey]);

	if (anchorElementRef.current === null || resolution === null || editor === null) {
		return null;
	}
	return <LexicalMenu
		close={closeNodeMenu}
		resolution={resolution}
		editor={editor}
		anchorElementRef={anchorElementRef}
		options={options}
		menuRenderFn={menuRenderFn}
		onSelectOption={onSelectOption}
		commandPriority={commandPriority}
	/>;
}
