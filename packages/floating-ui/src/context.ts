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
import type {
	ContextData,
	ExtendedElements,
	ExtendedRefs,
	FloatingContext,
	FloatingRootContext,
	OpenChangeReason,
	ReferenceType,
	UseFloatingOptions,
	UseFloatingReturn,
	UseFloatingRootContextOptions,
} from './types';

export { createPubSub } from './pubsub';

export function useFloatingRootContext(
	options: UseFloatingRootContextOptions,
	slot?: symbol | undefined,
): FloatingRootContext {
	const open = options.open ?? false;
	const onOpenChangeProp = options.onOpenChange;
	const elementsProp = options.elements;

	const floatingId = useId(subSlot(slot, 'id'));
	const dataRef = useRef<ContextData>({}, subSlot(slot, 'data'));
	const [events] = useState(() => createPubSub(), subSlot(slot, 'events'));
	const nested = useFloatingParentNodeId() != null;

	const [positionReference, setPositionReference] = useState<ReferenceType | null>(
		elementsProp.reference,
		subSlot(slot, 'posref'),
	);

	const onOpenChange = useEffectEvent(
		(openVal: boolean, event?: Event, reason?: OpenChangeReason) => {
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

	return useMemo<FloatingRootContext>(
		() => ({ dataRef, open, onOpenChange, elements, events, floatingId, refs }),
		[open, onOpenChange, elements, events, floatingId, refs],
		subSlot(slot, 'm:ret'),
	);
}

export function useFloating<RT extends ReferenceType = ReferenceType>(
	options?: UseFloatingOptions,
	slot?: symbol,
): UseFloatingReturn<RT>;
// Loose fallback: pre-typing callers built untyped option bags in plain `.ts`;
// they keep compiling while still receiving the typed return.
export function useFloating(
	options: Record<string, unknown> | undefined,
	slot?: symbol,
): UseFloatingReturn;
export function useFloating(...args: any[]): any {
	const [user, slot] = splitSlot(args);
	const options = (user[0] as UseFloatingOptions) ?? {};
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

	const [_domReference, setDomReference] = useState<Element | null>(null, subSlot(slot, 'domref'));
	const [positionReference, _setPositionReference] = useState<ReferenceType | null>(
		null,
		subSlot(slot, 'posref'),
	);
	const optionDomReference = computedElements?.domReference;
	const domReference = optionDomReference || _domReference;
	const domReferenceRef = useRef<Element | null>(null, subSlot(slot, 'domrefref'));
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
		(node: ReferenceType | null) => {
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
		(node: ReferenceType | null) => {
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

	const refs = useMemo<ExtendedRefs<ReferenceType>>(
		() => ({
			...position.refs,
			setReference,
			setPositionReference,
			domReference: domReferenceRef,
		}),
		[position.refs, setReference, setPositionReference],
		subSlot(slot, 'm:refs'),
	);

	const elements = useMemo<ExtendedElements<ReferenceType>>(
		() => ({ ...position.elements, domReference }),
		[position.elements, domReference],
		subSlot(slot, 'm:el'),
	);

	const context = useMemo<FloatingContext>(
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

	return useMemo<UseFloatingReturn>(
		() => ({ ...position, context, refs, elements }),
		[position, refs, elements, context],
		subSlot(slot, 'm:ret'),
	);
}
