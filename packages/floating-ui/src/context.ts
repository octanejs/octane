// Ported from @floating-ui/react: the event emitter, useFloatingRootContext, and
// the PUBLIC useFloating (which wraps the positioning core with the interaction
// context that the interaction hooks consume). React hooks → octane hooks; every
// internal hook gets a sub-slot derived from the caller's slot.
import { isElement } from '@floating-ui/utils/dom';
import { useCallback, useMemo, useRef, useState } from 'octane';

import { splitSlot, subSlot } from './internal';
import { createPubSub } from './pubsub';
import { useFloatingParentNodeId, useFloatingTree } from './tree';
import { useId } from './useId';
import { usePositionFloating } from './useFloating';
import { useEffectEvent, useModernLayoutEffect } from './utils';

export { createPubSub } from './pubsub';

export function useFloatingRootContext(options: any, slot: symbol | undefined): any {
	const open = options.open ?? false;
	const onOpenChangeProp = options.onOpenChange;
	const elementsProp = options.elements;

	const floatingId = useId(subSlot(slot, 'id'));
	const dataRef = useRef<any>({}, subSlot(slot, 'data'));
	const [events] = useState(() => createPubSub(), subSlot(slot, 'events'));
	const nested = useFloatingParentNodeId() != null;

	const [positionReference, setPositionReference] = useState(
		elementsProp.reference,
		subSlot(slot, 'posref'),
	);

	const onOpenChange = useEffectEvent(
		(openVal: boolean, event?: Event, reason?: string) => {
			dataRef.current.openEvent = openVal ? event : undefined;
			events.emit('openchange', { open: openVal, event, reason, nested });
			onOpenChangeProp?.(openVal, event, reason);
		},
		subSlot(slot, 'ooc'),
	);

	const refs = useMemo(() => ({ setPositionReference }), [], subSlot(slot, 'm:refs'));

	const elements = useMemo(
		() => ({
			reference: positionReference || elementsProp.reference || null,
			floating: elementsProp.floating || null,
			domReference: elementsProp.reference,
		}),
		[positionReference, elementsProp.reference, elementsProp.floating],
		subSlot(slot, 'm:el'),
	);

	return useMemo(
		() => ({ dataRef, open, onOpenChange, elements, events, floatingId, refs }),
		[open, onOpenChange, elements, events, floatingId, refs],
		subSlot(slot, 'm:ret'),
	);
}

export function useFloating(...args: any[]): any {
	const [user, slot] = splitSlot(args);
	const options = (user[0] as any) ?? {};
	const nodeId = options.nodeId;

	const internalRootContext = useFloatingRootContext(
		{
			...options,
			elements: {
				reference: null,
				floating: null,
				...options.elements,
			},
		},
		subSlot(slot, 'root'),
	);
	const rootContext = options.rootContext || internalRootContext;
	const computedElements = rootContext.elements;

	const [_domReference, setDomReference] = useState(null, subSlot(slot, 'domref'));
	const [positionReference, _setPositionReference] = useState(null, subSlot(slot, 'posref'));
	const optionDomReference = computedElements?.domReference;
	const domReference = optionDomReference || _domReference;
	const domReferenceRef = useRef<any>(null, subSlot(slot, 'domrefref'));
	const tree = useFloatingTree();

	useModernLayoutEffect(
		() => {
			if (domReference) {
				domReferenceRef.current = domReference;
			}
		},
		[domReference],
		subSlot(slot, 'e:domref'),
	);

	const position = usePositionFloating([
		{
			...options,
			elements: {
				...computedElements,
				...(positionReference ? { reference: positionReference } : {}),
			},
		},
		subSlot(slot, 'pos'),
	]);

	const setPositionReference = useCallback(
		(node: any) => {
			const computedPositionReference = isElement(node)
				? {
						getBoundingClientRect: () => node.getBoundingClientRect(),
						getClientRects: () => node.getClientRects(),
						contextElement: node,
					}
				: node;
			_setPositionReference(computedPositionReference);
			position.refs.setReference(computedPositionReference);
		},
		[position.refs],
		subSlot(slot, 'spr'),
	);

	const setReference = useCallback(
		(node: any) => {
			if (isElement(node) || node === null) {
				domReferenceRef.current = node;
				setDomReference(node);
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
		subSlot(slot, 'sr'),
	);

	const refs = useMemo(
		() => ({
			...position.refs,
			setReference,
			setPositionReference,
			domReference: domReferenceRef,
		}),
		[position.refs, setReference, setPositionReference],
		subSlot(slot, 'm:refs'),
	);

	const elements = useMemo(
		() => ({ ...position.elements, domReference }),
		[position.elements, domReference],
		subSlot(slot, 'm:el'),
	);

	const context = useMemo(
		() => ({ ...position, ...rootContext, refs, elements, nodeId }),
		[position, refs, elements, nodeId, rootContext],
		subSlot(slot, 'm:ctx'),
	);

	useModernLayoutEffect(
		() => {
			rootContext.dataRef.current.floatingContext = context;
			const node = tree?.nodesRef.current.find((n: any) => n.id === nodeId);
			if (node) {
				node.context = context;
			}
		},
		undefined,
		subSlot(slot, 'e:ctx'),
	);

	return useMemo(
		() => ({ ...position, context, refs, elements }),
		[position, refs, elements, context],
		subSlot(slot, 'm:ret'),
	);
}
