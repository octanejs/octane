import { useEffect, useRef } from 'octane';
import { useLazyMemo } from '@octanejs/dnd-kit-utilities';

import { getScrollableAncestors } from '../../utilities';

const defaultValue: Element[] = [];

export function useScrollableAncestors(node: HTMLElement | null) {
	const previousNode = useRef(node);

	const ancestors = useLazyMemo<Element[]>(
		(previousValue) => {
			if (!node) {
				return defaultValue;
			}

			if (
				previousValue &&
				previousValue !== defaultValue &&
				node &&
				previousNode.current &&
				node.parentNode === previousNode.current.parentNode
			) {
				return previousValue;
			}

			return getScrollableAncestors(node);
		},
		[node],
	);

	useEffect(() => {
		previousNode.current = node;
	}, [node]);

	return ancestors;
}
