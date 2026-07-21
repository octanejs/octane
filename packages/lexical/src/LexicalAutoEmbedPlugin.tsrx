// Ported from @lexical/react/src/LexicalAutoEmbedPlugin.tsx. Watches pasted
// AutoLink/Link nodes that match an embed config (YouTube, tweet, …) and shows a
// node menu offering to replace the link with an embed node. Built on the ported
// LexicalNodeMenuPlugin. Typed surface + AutoEmbedOption live in autoEmbedShared.ts.
import { $isLinkNode, AutoLinkNode, LinkNode } from '@lexical/link';
import type { AutoEmbedOption, EmbedConfig } from './autoEmbedShared';
import { INSERT_EMBED_COMMAND } from './autoEmbedShared';
import { useLexicalComposerContext } from './LexicalComposerContext';
import { LexicalNodeMenuPlugin } from './LexicalNodeMenuPlugin.tsrx';
import type { MenuRenderFn } from './shared/menuShared';
import type { CommandListenerPriority, LexicalNode, NodeKey, NodeMutation } from 'lexical';
import {
	$getNodeByKey,
	$getSelection,
	COMMAND_PRIORITY_EDITOR,
	COMMAND_PRIORITY_LOW,
	mergeRegister,
	PASTE_TAG,
} from 'lexical';
import { useCallback, useEffect, useMemo, useState } from 'octane';

export { URL_MATCHER, INSERT_EMBED_COMMAND, AutoEmbedOption } from './autoEmbedShared';

type LexicalAutoEmbedPluginProps<TEmbedConfig extends EmbedConfig> = {
	embedConfigs: TEmbedConfig[];
	onOpenEmbedModalForConfig?: (embedConfig: TEmbedConfig) => void;
	getMenuOptions: (activeEmbedConfig: TEmbedConfig, embedFn: () => void, dismissFn: () => void) => AutoEmbedOption[];
	menuRenderFn?: MenuRenderFn<AutoEmbedOption>;
	menuCommandPriority?: CommandListenerPriority;
};

export function LexicalAutoEmbedPlugin<TEmbedConfig extends EmbedConfig>(
	props: LexicalAutoEmbedPluginProps<TEmbedConfig>,
) {
	const embedConfigs = props.embedConfigs;
	const onOpenEmbedModalForConfig = props.onOpenEmbedModalForConfig;
	const getMenuOptions = props.getMenuOptions;
	const menuRenderFn = props.menuRenderFn;
	const menuCommandPriority =
		props.menuCommandPriority != null ? props.menuCommandPriority : COMMAND_PRIORITY_LOW;

	const [editor] = useLexicalComposerContext();

	const [nodeKey, setNodeKey] = useState<NodeKey | null>(null);
	const [activeEmbedConfig, setActiveEmbedConfig] = useState<TEmbedConfig | null>(null);

	const reset = useCallback(() => {
		setNodeKey(null);
		setActiveEmbedConfig(null);
	}, []);

	const checkIfLinkNodeIsEmbeddable = useCallback(async (key: NodeKey) => {
		const url = editor.read('latest', function () {
			const linkNode = $getNodeByKey(key);
			if ($isLinkNode(linkNode)) {
				return linkNode.getURL();
			}
		});
		if (url === undefined) {
			return;
		}
		for (const embedConfig of embedConfigs) {
			const urlMatch = await Promise.resolve(embedConfig.parseUrl(url));
			if (urlMatch != null) {
				setActiveEmbedConfig(embedConfig);
				setNodeKey(key);
			}
		}
	}, [editor, embedConfigs]);

	useEffect(() => {
		const listener = (
			nodeMutations: Map<NodeKey, NodeMutation>,
			{
				updateTags,
				dirtyLeaves,
			}: {
				updateTags: Set<string>;
				dirtyLeaves: Set<string>;
			},
		) => {
			for (const [key, mutation] of nodeMutations) {
				if (mutation === 'created' && updateTags.has(PASTE_TAG) && dirtyLeaves.size <= 3) {
					checkIfLinkNodeIsEmbeddable(key);
				} else if (key === nodeKey) {
					reset();
				}
			}
		};
		return mergeRegister(
			...[LinkNode, AutoLinkNode].map(
				(Klass) => editor.registerMutationListener(Klass, (...args) => listener(...args), {
					skipInitialization: true,
				}),
			),
		);
	}, [checkIfLinkNodeIsEmbeddable, editor, nodeKey, reset]);

	useEffect(() => {
		if (!onOpenEmbedModalForConfig) return;

		return editor.registerCommand(
			INSERT_EMBED_COMMAND,
			(embedConfigType) => {
				const embedConfig = embedConfigs.find(({ type }) => type === embedConfigType);
				if (embedConfig) {
					onOpenEmbedModalForConfig(embedConfig);
					return true;
				}
				return false;
			},
			COMMAND_PRIORITY_EDITOR,
		);
	}, [editor, embedConfigs, onOpenEmbedModalForConfig]);

	const embedLinkViaActiveEmbedConfig = useCallback(async function () {
		if (activeEmbedConfig != null && nodeKey != null) {
			const linkNode = editor.read('latest', () => {
				const node = $getNodeByKey(nodeKey);
				if ($isLinkNode(node)) {
					return node;
				}
				return null;
			});

			if ($isLinkNode(linkNode)) {
				const result = await Promise.resolve(activeEmbedConfig.parseUrl(linkNode.__url));
				if (result != null) {
					editor.update(() => {
						if (!$getSelection()) {
							linkNode.selectEnd();
						}
						activeEmbedConfig.insertNode(editor, result);
						if (linkNode.isAttached()) {
							linkNode.remove();
						}
					});
				}
			}
		}
	}, [activeEmbedConfig, editor, nodeKey]);

	const options = useMemo(() => {
		return activeEmbedConfig != null && nodeKey != null
			? getMenuOptions(activeEmbedConfig, embedLinkViaActiveEmbedConfig, reset)
			: [];
	}, [activeEmbedConfig, embedLinkViaActiveEmbedConfig, getMenuOptions, nodeKey, reset]);

	const onSelectOption = useCallback((
		selectedOption: AutoEmbedOption,
		targetNode: LexicalNode | null,
		closeMenu: () => void,
	) => {
		editor.update(() => {
			selectedOption.onSelect(targetNode);
			closeMenu();
		});
	}, [editor]);

	if (nodeKey == null) {
		return null;
	}
	return <LexicalNodeMenuPlugin
		nodeKey={nodeKey}
		onClose={reset}
		onSelectOption={onSelectOption}
		options={options}
		menuRenderFn={menuRenderFn}
		commandPriority={menuCommandPriority}
	/>;
}
