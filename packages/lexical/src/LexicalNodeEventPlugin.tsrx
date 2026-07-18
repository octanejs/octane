// Ported from @lexical/react/src/LexicalNodeEventPlugin.ts.
import { useLexicalComposerContext } from './LexicalComposerContext';
import { $findMatchingParent, $getNearestNodeFromDOMNode } from 'lexical';
import type { Klass, LexicalEditor, LexicalNode, NodeKey } from 'lexical';
import { useEffect, useRef } from 'octane';

const capturedEvents = new Set(['mouseenter', 'mouseleave']);

type Props = {
	nodeType: Klass<LexicalNode>;
	eventType: string;
	eventListener: (event: Event, editor: LexicalEditor, nodeKey: NodeKey) => void;
};

export function NodeEventPlugin(props: Props) {
	const [editor] = useLexicalComposerContext();
	const nodeType = props.nodeType;
	const eventType = props.eventType;
	const eventListener = props.eventListener;

	const listenerRef = useRef(eventListener);
	listenerRef.current = eventListener;

	useEffect(() => {
		const isCaptured = capturedEvents.has(eventType);

		const onEvent = (event: Event) => {
			editor.update(() => {
				const nearestNode = $getNearestNodeFromDOMNode(event.target as Node);
				if (nearestNode !== null) {
					const targetNode =
						isCaptured
							? nearestNode instanceof nodeType
								? nearestNode
								: null
							: $findMatchingParent(nearestNode, (node) => node instanceof nodeType);
					if (targetNode !== null) {
						listenerRef.current(event, editor, targetNode.getKey());
						return;
					}
				}
			});
		};

		return editor.registerRootListener((rootElement) => {
			if (rootElement) {
				rootElement.addEventListener(eventType, onEvent, isCaptured);
				return () => rootElement.removeEventListener(eventType, onEvent, isCaptured);
			}
		});
		// We intentionally don't respect changes to eventType.
	}, [editor, nodeType]);

	return null;
}
