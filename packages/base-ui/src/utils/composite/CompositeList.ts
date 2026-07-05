// Ported from .base-ui/packages/react/src/internals/composite/list/CompositeList.tsx.
// Registers composite items in a stable Map, sorts them by document position to assign each
// a DOM-order `index`, and notifies subscribers (`onMapChange` / `subscribeMapChange`) plus
// keeps `elementsRef` sized. A MutationObserver re-sorts when the DOM reorders. Rendered by
// CompositeRoot as `<CompositeListContext.Provider>{children}</Provider>`.
import { createElement, useLayoutEffect, useMemo, useRef, useState } from 'octane';

import { S, subSlot } from '../../internal';
import { useStableCallback } from '../useStableCallback';
import { useRefWithInit } from '../useRefWithInit';
import { CompositeListContext } from './CompositeListContext';

export type CompositeMetadata<CustomMetadata> = {
	index?: number | null | undefined;
} & CustomMetadata;

export interface CompositeListProps<Metadata> {
	children: any;
	elementsRef: { current: Array<HTMLElement | null> };
	labelsRef?: { current: Array<string | null> } | undefined;
	onMapChange?: (newMap: Map<Element, CompositeMetadata<Metadata> | null>) => void;
}

function createMap<Metadata>(): Map<Element, CompositeMetadata<Metadata> | null> {
	return new Map();
}

function createListeners(): Set<Function> {
	return new Set();
}

function sortByDocumentPosition(a: Element, b: Element): number {
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

export function CompositeList<Metadata>(props: CompositeListProps<Metadata>): any {
	const slot = S('CompositeList');
	const { children, elementsRef, labelsRef, onMapChange: onMapChangeProp } = props;

	const onMapChange = useStableCallback(onMapChangeProp, subSlot(slot, 'omc'));

	const nextIndexRef = useRef(0, subSlot(slot, 'nextIdx'));
	const listeners = useRefWithInit<Set<Function>>(
		createListeners,
		subSlot(slot, 'listeners'),
	).current;

	const map = useRefWithInit<Map<Element, CompositeMetadata<Metadata> | null>>(
		createMap,
		subSlot(slot, 'map'),
	).current;
	const [mapTick, setMapTick] = useState(0, subSlot(slot, 'tick'));
	const lastTickRef = useRef(mapTick, subSlot(slot, 'lastTick'));

	const register = useStableCallback(
		(node: Element, metadata: Metadata) => {
			map.set(node, (metadata ?? null) as CompositeMetadata<Metadata> | null);
			lastTickRef.current += 1;
			setMapTick(lastTickRef.current);
		},
		subSlot(slot, 'reg'),
	);

	const unregister = useStableCallback(
		(node: Element) => {
			map.delete(node);
			lastTickRef.current += 1;
			setMapTick(lastTickRef.current);
		},
		subSlot(slot, 'unreg'),
	);

	const sortedMap = useMemo(
		() => {
			const newMap = new Map<Element, CompositeMetadata<Metadata>>();
			const sortedNodes = Array.from(map.keys())
				.filter((node) => node.isConnected)
				.sort(sortByDocumentPosition);
			sortedNodes.forEach((node, index) => {
				const metadata = map.get(node) ?? ({} as CompositeMetadata<Metadata>);
				newMap.set(node, { ...metadata, index });
			});
			return newMap;
		},
		[map, mapTick],
		subSlot(slot, 'sorted'),
	);

	useLayoutEffect(
		() => {
			if (typeof MutationObserver !== 'function' || sortedMap.size === 0) {
				return undefined;
			}
			const mutationObserver = new MutationObserver((entries) => {
				const diff = new Set<Node>();
				const updateDiff = (node: Node) => (diff.has(node) ? diff.delete(node) : diff.add(node));
				entries.forEach((entry) => {
					entry.removedNodes.forEach(updateDiff);
					entry.addedNodes.forEach(updateDiff);
				});
				if (diff.size === 0) {
					lastTickRef.current += 1;
					setMapTick(lastTickRef.current);
				}
			});
			sortedMap.forEach((_, node) => {
				if (node.parentElement) {
					mutationObserver.observe(node.parentElement, { childList: true });
				}
			});
			return () => {
				mutationObserver.disconnect();
			};
		},
		[sortedMap],
		subSlot(slot, 'e:mo'),
	);

	useLayoutEffect(
		() => {
			const shouldUpdateLengths = lastTickRef.current === mapTick;
			if (shouldUpdateLengths) {
				if (elementsRef.current.length !== sortedMap.size) {
					elementsRef.current.length = sortedMap.size;
				}
				if (labelsRef && labelsRef.current.length !== sortedMap.size) {
					labelsRef.current.length = sortedMap.size;
				}
				nextIndexRef.current = sortedMap.size;
			}
			onMapChange(sortedMap);
		},
		[onMapChange, sortedMap, elementsRef, labelsRef, mapTick],
		subSlot(slot, 'e:len'),
	);

	useLayoutEffect(
		() => () => {
			elementsRef.current = [];
		},
		[elementsRef],
		subSlot(slot, 'e:cleanEl'),
	);

	useLayoutEffect(
		() => () => {
			if (labelsRef) {
				labelsRef.current = [];
			}
		},
		[labelsRef],
		subSlot(slot, 'e:cleanLbl'),
	);

	const subscribeMapChange = useStableCallback(
		(fn: (map: Map<Element, any>) => void) => {
			listeners.add(fn);
			return () => {
				listeners.delete(fn);
			};
		},
		subSlot(slot, 'sub'),
	);

	useLayoutEffect(
		() => {
			listeners.forEach((l) => (l as (m: any) => void)(sortedMap));
		},
		[listeners, sortedMap],
		subSlot(slot, 'e:notify'),
	);

	const contextValue = useMemo(
		() => ({ register, unregister, subscribeMapChange, elementsRef, labelsRef, nextIndexRef }),
		[register, unregister, subscribeMapChange, elementsRef, labelsRef, nextIndexRef],
		subSlot(slot, 'ctx'),
	);

	return createElement(CompositeListContext.Provider, { value: contextValue, children });
}
