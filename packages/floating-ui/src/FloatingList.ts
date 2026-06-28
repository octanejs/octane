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

import { S, splitSlot, subSlot } from './internal';
import { useModernLayoutEffect } from './utils';

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

export const FloatingListContext = createContext<any>({
	register: () => {},
	unregister: () => {},
	map: new Map(),
	elementsRef: { current: [] },
});

export function FloatingList(props: any): any {
	const children = props.children;
	const elementsRef = props.elementsRef;
	const labelsRef = props.labelsRef;

	const [nodes, setNodes] = useState(() => new Set<any>(), S('FloatingList:nodes'));
	const register = useCallback(
		(node: any) => {
			setNodes((prevSet: Set<any>) => new Set(prevSet).add(node));
		},
		[],
		S('FloatingList:register'),
	);
	const unregister = useCallback(
		(node: any) => {
			setNodes((prevSet: Set<any>) => {
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
			const newMap = new Map();
			const sortedNodes = Array.from(nodes.keys()).sort(sortByDocumentPosition);
			sortedNodes.forEach((node, index) => {
				newMap.set(node, index);
			});
			return newMap;
		},
		[nodes],
		S('FloatingList:map'),
	);
	const value = useMemo(
		() => ({ register, unregister, map, elementsRef, labelsRef }),
		[register, unregister, map, elementsRef, labelsRef],
		S('FloatingList:value'),
	);
	return createElement(FloatingListContext.Provider, { value, children });
}

export function useListItem(...args: any[]): any {
	const [user, slotArg] = splitSlot(args);
	const slot = slotArg ?? S('useListItem');
	const props = (user[0] as any) ?? {};
	const label = props.label;

	const { register, unregister, map, elementsRef, labelsRef } = useContext(FloatingListContext);
	const [index, setIndex] = useState<any>(null, subSlot(slot, 'index'));
	const componentRef = useRef<any>(null, subSlot(slot, 'ref'));

	const ref = useCallback(
		(node: any) => {
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
