// Ported from @floating-ui/react FloatingList + useListItem — registers list items
// and their DOM order so useListNavigation/useTypeahead can index them. `.ts`
// component via createElement; useListItem is a hook (resolves its own slot).
import {
	createContext,
	createElement,
	useCallback,
	useContext,
	useMemo,
	useRef,
	useState,
} from 'octane';
import type { OctaneNode } from 'octane';

import { S, splitSlot, subSlot } from './internal';
import { useModernLayoutEffect } from './utils';
import type { MutableRefObject } from './types';

function sortByDocumentPosition(a: Node, b: Node): number {
	const position = a.compareDocumentPosition(b);
	if (
		position & Node.DOCUMENT_POSITION_FOLLOWING ||
		position & Node.DOCUMENT_POSITION_CONTAINED_BY
	) {
		return -1;
	}
	if (position & Node.DOCUMENT_POSITION_PRECEDING || position & Node.DOCUMENT_POSITION_CONTAINS) {
		return 1;
	}
	return 0;
}

interface FloatingListContextValue {
	register: (node: Node) => void;
	unregister: (node: Node) => void;
	map: Map<Node, number | null>;
	elementsRef: MutableRefObject<Array<HTMLElement | null>>;
	labelsRef?: MutableRefObject<Array<string | null>>;
}

export const FloatingListContext = createContext<FloatingListContextValue>({
	register: () => {},
	unregister: () => {},
	map: new Map(),
	elementsRef: { current: [] },
});

export interface FloatingListProps {
	children: OctaneNode;
	/**
	 * A ref to the list of HTML elements, ordered by their index.
	 * `useListNavigation`'s `listRef` prop.
	 */
	elementsRef: MutableRefObject<Array<HTMLElement | null>>;
	/**
	 * A ref to the list of element labels, ordered by their index.
	 * `useTypeahead`'s `listRef` prop.
	 */
	labelsRef?: MutableRefObject<Array<string | null>>;
}

/**
 * Provides context for a list of items within the floating element.
 * @see https://floating-ui.com/docs/FloatingList
 */
export function FloatingList(props: FloatingListProps): OctaneNode {
	const children = props.children;
	const elementsRef = props.elementsRef;
	const labelsRef = props.labelsRef;

	const [nodes, setNodes] = useState(() => new Set<Node>(), S('FloatingList:nodes'));
	const register = useCallback(
		(node: Node) => {
			setNodes((prevSet) => new Set(prevSet).add(node));
		},
		[],
		S('FloatingList:register'),
	);
	const unregister = useCallback(
		(node: Node) => {
			setNodes((prevSet) => {
				const set = new Set(prevSet);
				set.delete(node);
				return set;
			});
		},
		[],
		S('FloatingList:unregister'),
	);
	const map = useMemo(
		() => {
			const newMap = new Map<Node, number | null>();
			const sortedNodes = Array.from(nodes.keys()).sort(sortByDocumentPosition);
			sortedNodes.forEach((node, index) => {
				newMap.set(node, index);
			});
			return newMap;
		},
		[nodes],
		S('FloatingList:map'),
	);
	const value = useMemo<FloatingListContextValue>(
		() => ({ register, unregister, map, elementsRef, labelsRef }),
		[register, unregister, map, elementsRef, labelsRef],
		S('FloatingList:value'),
	);
	return createElement(FloatingListContext.Provider, { value, children });
}

export interface UseListItemProps {
	label?: string | null;
}

/**
 * Used to register a list item and its index (DOM position) in the
 * `FloatingList`.
 * @see https://floating-ui.com/docs/FloatingList#uselistitem
 */
export function useListItem(
	props?: UseListItemProps,
	slot?: symbol,
): { ref: (node: HTMLElement | null) => void; index: number };
export function useListItem(slot?: symbol): {
	ref: (node: HTMLElement | null) => void;
	index: number;
};
export function useListItem(...args: any[]): any {
	const [user, slotArg] = splitSlot(args);
	const slot = slotArg ?? S('useListItem');
	const props = (user[0] as UseListItemProps) ?? {};
	const label = props.label;

	const { register, unregister, map, elementsRef, labelsRef } = useContext(FloatingListContext);
	const [index, setIndex] = useState<number | null>(null, subSlot(slot, 'index'));
	const componentRef = useRef<HTMLElement | null>(null, subSlot(slot, 'ref'));

	const ref = useCallback(
		(node: HTMLElement | null) => {
			componentRef.current = node;
			if (index !== null) {
				elementsRef.current[index] = node;
				if (labelsRef) {
					const isLabelDefined = label !== undefined;
					labelsRef.current[index] = isLabelDefined ? label : (node?.textContent ?? null);
				}
			}
		},
		[index, elementsRef, labelsRef, label],
		subSlot(slot, 'cb'),
	);

	useModernLayoutEffect(
		() => {
			const node = componentRef.current;
			if (node) {
				register(node);
				return () => {
					unregister(node);
				};
			}
		},
		[register, unregister],
		subSlot(slot, 'e:reg'),
	);

	useModernLayoutEffect(
		() => {
			const idx = componentRef.current ? map.get(componentRef.current) : null;
			if (idx != null) {
				setIndex(idx);
			}
		},
		[map],
		subSlot(slot, 'e:idx'),
	);

	return useMemo(
		() => ({ ref, index: index == null ? -1 : index }),
		[index, ref],
		subSlot(slot, 'ret'),
	);
}
