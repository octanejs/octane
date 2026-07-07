// Ported from .base-ui/packages/react/src/floating-ui-react/hooks/useFloating.ts (v1.6.0),
// octane-adapted (slot-threaded). Base UI wraps `@floating-ui/react-dom`'s `useFloating` (imported
// as `usePosition`) with its Store-based `FloatingRootStore`; octane swaps the react-dom wrapper for
// `@octanejs/floating-ui`'s `usePositionFloating` (the octane port of exactly that hook), keeping
// all of Base UI's store logic. Everything else — reference/floating element wiring, position
// reference bridging, the `FloatingContext` shape — is faithful.
import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'octane';
import { usePositionFloating } from '@octanejs/floating-ui';

import { S, subSlot } from '../../internal';
import { isElement } from '../dom';
import { useFloatingTree } from './FloatingTree';
import { useFloatingRootContext } from './useFloatingRootContext';
import type { FloatingRootStore } from './FloatingRootStore';

export function useFloating(options: any = {}, slot?: symbol | undefined): any {
	const localSlot = slot ?? S('useFloating');
	const { nodeId, externalTree } = options;

	const internalStore = useFloatingRootContext(options, subSlot(localSlot, 'internal'));
	const store: FloatingRootStore = options.rootContext || internalStore;

	const referenceElement = store.useState('referenceElement', subSlot(localSlot, 'ref'));
	const floatingElement = store.useState('floatingElement', subSlot(localSlot, 'flo'));
	const domReferenceElement = store.useState('domReferenceElement', subSlot(localSlot, 'dref'));
	const open = store.useState('open', subSlot(localSlot, 'open'));
	const floatingId = store.useState('floatingId', subSlot(localSlot, 'fid'));

	const [positionReference, setPositionReferenceRaw] = useState<any>(
		null,
		subSlot(localSlot, 'posref'),
	);
	const [localDomReference, setLocalDomReference] = useState<any>(
		undefined,
		subSlot(localSlot, 'ldref'),
	);
	const [localFloatingElement, setLocalFloatingElement] = useState<any>(
		undefined,
		subSlot(localSlot, 'lflo'),
	);

	const domReferenceRef = useRef<any>(null, subSlot(localSlot, 'drefref'));

	const tree = useFloatingTree(externalTree);

	const storeElements = useMemo(
		() => ({
			reference: referenceElement,
			floating: floatingElement,
			domReference: domReferenceElement,
		}),
		[referenceElement, floatingElement, domReferenceElement],
		subSlot(localSlot, 'm:se'),
	);

	const position = usePositionFloating([
		{
			...options,
			elements: {
				...storeElements,
				...(positionReference && { reference: positionReference }),
			},
		},
		subSlot(localSlot, 'pos'),
	]);

	const localDomReferenceElement = isElement(localDomReference)
		? (localDomReference as Element)
		: null;

	const syncedFloatingElement =
		localFloatingElement === undefined ? store.state.floatingElement : localFloatingElement;

	store.useSyncedValue('referenceElement', localDomReference ?? null, subSlot(localSlot, 's:ref'));
	store.useSyncedValue(
		'domReferenceElement',
		localDomReference === undefined ? domReferenceElement : localDomReferenceElement,
		subSlot(localSlot, 's:dref'),
	);
	store.useSyncedValue('floatingElement', syncedFloatingElement, subSlot(localSlot, 's:flo'));

	const setPositionReference = useCallback(
		(node: any) => {
			const computedPositionReference = isElement(node)
				? {
						getBoundingClientRect: () => node.getBoundingClientRect(),
						getClientRects: () => node.getClientRects(),
						contextElement: node,
					}
				: node;
			setPositionReferenceRaw(computedPositionReference);
			position.refs.setReference(computedPositionReference);
		},
		[position.refs],
		subSlot(localSlot, 'spr'),
	);

	const setReference = useCallback(
		(node: any) => {
			if (isElement(node) || node === null) {
				domReferenceRef.current = node;
				setLocalDomReference(node);
			}

			if (
				isElement(position.refs.reference.current) ||
				position.refs.reference.current === null ||
				(node !== null && !isElement(node))
			) {
				position.refs.setReference(node);
			}
		},
		[position.refs],
		subSlot(localSlot, 'sr'),
	);

	const setFloating = useCallback(
		(node: any) => {
			setLocalFloatingElement(node);
			position.refs.setFloating(node);
		},
		[position.refs],
		subSlot(localSlot, 'sf'),
	);

	const refs = useMemo(
		() => ({
			...position.refs,
			setReference,
			setFloating,
			setPositionReference,
			domReference: domReferenceRef,
		}),
		[position.refs, setReference, setFloating, setPositionReference],
		subSlot(localSlot, 'm:refs'),
	);

	const elements = useMemo(
		() => ({
			...position.elements,
			domReference: domReferenceElement,
		}),
		[position.elements, domReferenceElement],
		subSlot(localSlot, 'm:el'),
	);

	const context = useMemo(
		() => ({
			...position,
			dataRef: store.context.dataRef,
			open,
			onOpenChange: store.setOpen,
			events: store.context.events,
			floatingId,
			refs,
			elements,
			nodeId,
			rootStore: store,
		}),
		[position, refs, elements, nodeId, store, open, floatingId],
		subSlot(localSlot, 'm:ctx'),
	);

	useLayoutEffect(
		() => {
			if (domReferenceElement) {
				domReferenceRef.current = domReferenceElement;
			}
		},
		[domReferenceElement],
		subSlot(localSlot, 'e:dref'),
	);

	useLayoutEffect(
		() => {
			store.context.dataRef.current.floatingContext = context;

			const node = tree?.nodesRef.current.find((n: any) => n.id === nodeId);
			if (node) {
				node.context = context;
			}
		},
		undefined,
		subSlot(localSlot, 'e:ctx'),
	);

	return useMemo(
		() => ({
			...position,
			context,
			refs,
			elements,
			rootStore: store,
		}),
		[position, refs, elements, context, store],
		subSlot(localSlot, 'm:ret'),
	);
}
