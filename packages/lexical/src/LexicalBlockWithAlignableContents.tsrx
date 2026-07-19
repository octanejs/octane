// Ported from @lexical/react/src/LexicalBlockWithAlignableContents.tsx. Wraps a
// DecoratorBlockNode's contents, syncing node selection + element alignment:
// reflects the node's `format` alignment, responds to FORMAT_ELEMENT_COMMAND, and
// toggles selection on click.
import { useLexicalComposerContext } from './LexicalComposerContext';
import { $isDecoratorBlockNode } from './LexicalDecoratorBlockNode';
import { useLexicalNodeSelection } from './useLexicalNodeSelection';
import { $getNearestBlockElementAncestorOrThrow } from '@lexical/utils';
import {
	$getNodeByKey,
	$getSelection,
	$isNodeSelection,
	$isRangeSelection,
	CLICK_COMMAND,
	COMMAND_PRIORITY_LOW,
	FORMAT_ELEMENT_COMMAND,
	getComposedEventTarget,
	mergeRegister,
} from 'lexical';
import type { ElementFormatType, NodeKey } from 'lexical';
import { useEffect, useRef } from 'octane';
import type { OctaneNode } from 'octane';

type Props = Readonly<{
		children: OctaneNode;
		format?: ElementFormatType | null;
		nodeKey: NodeKey;
		className: Readonly<{
			base: string;
			focus: string;
		}>;
	}>;

export function BlockWithAlignableContents(props: Props) {
	const nodeKey = props.nodeKey;
	const format = props.format;
	const className = props.className;

	const [editor] = useLexicalComposerContext();
	const [isSelected, setSelected, clearSelection] = useLexicalNodeSelection(nodeKey);
	const ref = useRef(null);

	useEffect(() => {
		return mergeRegister(
			editor.registerCommand(
				FORMAT_ELEMENT_COMMAND,
				(formatType) => {
					if (isSelected) {
						const selection = $getSelection();
						if ($isNodeSelection(selection)) {
							const node = $getNodeByKey(nodeKey);
							if ($isDecoratorBlockNode(node)) {
								node.setFormat(formatType);
							}
						} else if ($isRangeSelection(selection)) {
							const nodes = selection.getNodes();
							for (const node of nodes) {
								if ($isDecoratorBlockNode(node)) {
									node.setFormat(formatType);
								} else {
									const element = $getNearestBlockElementAncestorOrThrow(node);
									element.setFormat(formatType);
								}
							}
						}
						return true;
					}
					return false;
				},
				COMMAND_PRIORITY_LOW,
			),
			editor.registerCommand(
				CLICK_COMMAND,
				(event) => {
					if (getComposedEventTarget(event) === ref.current) {
						event.preventDefault();
						if (!event.shiftKey) {
							clearSelection();
						}
						setSelected(!isSelected);
						return true;
					}
					return false;
				},
				COMMAND_PRIORITY_LOW,
			),
		);
	}, [clearSelection, editor, isSelected, nodeKey, setSelected]);

	const cls = [className.base, isSelected ? className.focus : null].filter(Boolean).join(' ');

	return <div
		class={cls}
		ref={ref}
		style={{ textAlign: format ? format : undefined }}
	>{props.children}</div>;
}
