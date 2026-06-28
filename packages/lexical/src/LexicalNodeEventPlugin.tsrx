// Ported from @lexical/react/src/LexicalNodeEventPlugin.ts.
import { useLexicalComposerContext } from './LexicalComposerContext';
import { $findMatchingParent, $getNearestNodeFromDOMNode } from 'lexical';
import { useEffect, useRef } from 'octane';

const capturedEvents = new Set(['mouseenter', 'mouseleave']);

export function NodeEventPlugin(props) {
	const [editor] = useLexicalComposerContext();
	const nodeType = props.nodeType;
	const eventType = props.eventType;
	const eventListener = props.eventListener;

	const listenerRef = useRef(eventListener);
	listenerRef.current = eventListener;

	useEffect(() => {
		const isCaptured = capturedEvents.has(eventType);

		const onEvent = (event) => {
			editor.update(() => {
				const nearestNode = $getNearestNodeFromDOMNode(event.target);
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
