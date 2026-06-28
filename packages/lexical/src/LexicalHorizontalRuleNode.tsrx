// Ported from @lexical/react/src/LexicalHorizontalRuleNode.tsx. The node's
// decorate() returns a `<HorizontalRuleComponent/>` — at octane value position
// that lowers to an element descriptor, which the Decorators portal renders into
// the <hr> element Lexical created. This is the first decorator node, so it
// exercises the full decorator portal-map.
import {
	$isHorizontalRuleNode,
	HorizontalRuleNode as BaseHorizontalRuleNode,
	INSERT_HORIZONTAL_RULE_COMMAND,
} from '@lexical/extension';
import { useLexicalComposerContext } from './LexicalComposerContext';
import { useLexicalNodeSelection } from './useLexicalNodeSelection';
import {
	$applyNodeReplacement,
	addClassNamesToElement,
	CLICK_COMMAND,
	COMMAND_PRIORITY_LOW,
	getComposedEventTarget,
	mergeRegister,
	removeClassNamesFromElement,
} from 'lexical';
import { useEffect } from 'octane';

export { $isHorizontalRuleNode, INSERT_HORIZONTAL_RULE_COMMAND } from '@lexical/extension';

function HorizontalRuleComponent(props) {
	const nodeKey = props.nodeKey;
	const [editor] = useLexicalComposerContext();
	const [isSelected, setSelected, clearSelection] = useLexicalNodeSelection(nodeKey);

	useEffect(() => {
		return mergeRegister(
			editor.registerCommand(
				CLICK_COMMAND,
				(event) => {
					const hrElem = editor.getElementByKey(nodeKey);
					if (getComposedEventTarget(event) === hrElem) {
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

	useEffect(() => {
		const hrElem = editor.getElementByKey(nodeKey);
		const isSelectedClassName = editor._config.theme.hrSelected ?? 'selected';
		if (hrElem !== null) {
			if (isSelected) {
				addClassNamesToElement(hrElem, isSelectedClassName);
			} else {
				removeClassNamesFromElement(hrElem, isSelectedClassName);
			}
		}
	}, [editor, isSelected, nodeKey]);

	return null;
}

export class HorizontalRuleNode extends BaseHorizontalRuleNode {
	static getType() {
		return 'horizontalrule';
	}

	static clone(node) {
		return new HorizontalRuleNode(node.__key);
	}

	static importJSON(serializedNode) {
		return $createHorizontalRuleNode().updateFromJSON(serializedNode);
	}

	static importDOM() {
		return {
			hr: () => ({
				conversion: $convertHorizontalRuleElement,
				priority: 0,
			}),
		};
	}

	decorate() {
		return <HorizontalRuleComponent nodeKey={this.__key} />;
	}
}

function $convertHorizontalRuleElement() {
	return { node: $createHorizontalRuleNode() };
}

export function $createHorizontalRuleNode() {
	return $applyNodeReplacement(new HorizontalRuleNode());
}
