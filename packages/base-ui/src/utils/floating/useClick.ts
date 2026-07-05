// Ported from .base-ui/packages/react/src/floating-ui-react/hooks/useClick.ts (v1.6.0), octane-
// adapted: reads the FloatingRootStore (`store.select`/`store.setOpen`/`store.context.dataRef`);
// native events (no `.nativeEvent`); slot-threaded. Returns an `ElementProps` bag (`{ reference }`)
// the trigger merges onto its button.
import { useRef, useMemo } from 'octane';

import { subSlot } from '../../internal';
import { useAnimationFrame } from '../useAnimationFrame';
import { useTimeout } from '../useTimeout';
import { EMPTY_OBJECT } from '../empty';
import { getTarget, isTypeableElement } from './element';
import { isMouseLikePointerType } from './event';
import { createChangeEventDetails, REASONS } from '../createChangeEventDetails';
import type { ElementProps, FloatingContext, FloatingRootContext } from './types';

export interface UseClickProps {
	enabled?: boolean | undefined;
	event?: 'click' | 'mousedown' | 'mousedown-only' | undefined;
	toggle?: boolean | undefined;
	ignoreMouse?: boolean | undefined;
	stickIfOpen?: boolean | undefined;
	touchOpenDelay?: number | undefined;
	reason?: string | undefined;
}

export function useClick(
	context: FloatingRootContext | FloatingContext,
	props: UseClickProps,
	slot: symbol | undefined,
): ElementProps {
	const {
		enabled = true,
		event: eventOption = 'click',
		toggle = true,
		ignoreMouse = false,
		stickIfOpen = true,
		touchOpenDelay = 0,
		reason = REASONS.triggerPress,
	} = props;

	const store = (context && 'rootStore' in context ? context.rootStore : context) as any;
	const dataRef = store.context.dataRef;

	const pointerTypeRef = useRef<'mouse' | 'pen' | 'touch' | undefined>(
		undefined,
		subSlot(slot, 'pt'),
	);
	const frame = useAnimationFrame(subSlot(slot, 'frame'));
	const touchOpenTimeout = useTimeout(subSlot(slot, 'to'));

	const reference = useMemo<ElementProps['reference']>(
		() => {
			function setOpenWithTouchDelay(
				nextOpen: boolean,
				nativeEvent: any,
				target: HTMLElement,
				pointerType: 'mouse' | 'pen' | 'touch' | undefined,
			) {
				const details = createChangeEventDetails(reason, nativeEvent, target);
				if (nextOpen && pointerType === 'touch' && touchOpenDelay > 0) {
					touchOpenTimeout.start(touchOpenDelay, () => {
						store.setOpen(true, details);
					});
				} else {
					store.setOpen(nextOpen, details);
				}
			}

			function getNextOpen(
				open: boolean,
				currentTarget: EventTarget | null,
				isClickLikeOpenEvent: (eventType: string | undefined) => boolean,
			) {
				const openEvent = dataRef.current.openEvent;
				const hasClickedOnInactiveTrigger = store.select('domReferenceElement') !== currentTarget;
				if (open && hasClickedOnInactiveTrigger) {
					return true;
				}
				if (!open) {
					return true;
				}
				if (!toggle) {
					return true;
				}
				if (openEvent && stickIfOpen) {
					return !isClickLikeOpenEvent(openEvent.type);
				}
				return false;
			}

			return {
				onPointerDown(event: any) {
					pointerTypeRef.current = event.pointerType;
				},
				onMouseDown(event: any) {
					const pointerType = pointerTypeRef.current;
					const nativeEvent = event;
					const open = store.select('open');

					if (
						event.button !== 0 ||
						eventOption === 'click' ||
						(isMouseLikePointerType(pointerType, true) && ignoreMouse)
					) {
						return;
					}

					const nextOpen = getNextOpen(
						open,
						event.currentTarget,
						(openEventType) => openEventType === 'click' || openEventType === 'mousedown',
					);

					const target = getTarget(nativeEvent);
					if (isTypeableElement(target)) {
						setOpenWithTouchDelay(nextOpen, nativeEvent, target as HTMLElement, pointerType);
						return;
					}

					const eventCurrentTarget = event.currentTarget as HTMLElement;
					frame.request(() => {
						setOpenWithTouchDelay(nextOpen, nativeEvent, eventCurrentTarget, pointerType);
					});
				},
				onClick(event: any) {
					if (eventOption === 'mousedown-only') {
						return;
					}
					const pointerType = pointerTypeRef.current;
					if (eventOption === 'mousedown' && pointerType) {
						pointerTypeRef.current = undefined;
						return;
					}
					if (isMouseLikePointerType(pointerType, true) && ignoreMouse) {
						return;
					}
					const open = store.select('open');
					const nextOpen = getNextOpen(
						open,
						event.currentTarget,
						(openEventType) =>
							openEventType === 'click' ||
							openEventType === 'mousedown' ||
							openEventType === 'keydown' ||
							openEventType === 'keyup',
					);
					setOpenWithTouchDelay(nextOpen, event, event.currentTarget as HTMLElement, pointerType);
				},
				onKeyDown() {
					pointerTypeRef.current = undefined;
				},
			};
		},
		[
			dataRef,
			eventOption,
			ignoreMouse,
			reason,
			store,
			stickIfOpen,
			toggle,
			frame,
			touchOpenTimeout,
			touchOpenDelay,
		],
		subSlot(slot, 'ref'),
	);

	return useMemo(
		() => (enabled ? { reference } : EMPTY_OBJECT),
		[enabled, reference],
		subSlot(slot, 'out'),
	);
}
