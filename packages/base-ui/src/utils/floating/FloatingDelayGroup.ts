// Ported from .base-ui/packages/react/src/floating-ui-react/components/FloatingDelayGroup.tsx
// (v1.6.0). A group of tooltips that share one hover delay: once any member has opened, the others
// open instantly until the group's `timeoutMs` window lapses. The delay lives in a ref so changing
// it does not re-render unrelated consumers.
//
// octane adaptations: `createContext`/`createElement` instead of JSX; `useIsoLayoutEffect` →
// `useLayoutEffect`; every composed hook threads an explicit slot.
import {
	createContext,
	createElement,
	useContext,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
} from 'octane';

import { S, splitSlot, subSlot } from '../../internal';
import { Timeout, useTimeout } from '../useTimeout';
import { createChangeEventDetails, REASONS } from '../createChangeEventDetails';
import { getDelay } from './useHoverShared';
import type { HoverDelay } from './useHoverShared';

interface DelayGroupContextValue {
	hasProvider: boolean;
	timeoutMs: number;
	delayRef: { current: HoverDelay };
	initialDelayRef: { current: HoverDelay };
	timeout: Timeout;
	currentIdRef: { current: any };
	currentContextRef: {
		current: {
			onOpenChange: (open: boolean, eventDetails: any) => void;
			setIsInstantPhase: (value: boolean) => void;
		} | null;
	};
}

const DEFAULT_CONTEXT: DelayGroupContextValue = {
	hasProvider: false,
	timeoutMs: 0,
	delayRef: { current: 0 },
	initialDelayRef: { current: 0 },
	timeout: new Timeout(),
	currentIdRef: { current: null },
	currentContextRef: { current: null },
};

const FloatingDelayGroupContext = createContext<DelayGroupContextValue>(DEFAULT_CONTEXT);

function resetDelayRef(
	delayRef: { current: HoverDelay },
	initialDelayRef: { current: HoverDelay },
): void {
	delayRef.current = initialDelayRef.current;
}

export interface FloatingDelayGroupProps {
	children?: any;
	/** The delay to use for the group when it's not in the instant phase. */
	delay: HoverDelay;
	/**
	 * An explicit timeout for the group, representing when grouping logic stops being active
	 * after the close delay completes. Useful when there is no close delay at all.
	 */
	timeoutMs?: number | undefined;
}

export function FloatingDelayGroup(props: FloatingDelayGroupProps): any {
	const slot = S('FloatingDelayGroup');
	const { children, delay, timeoutMs = 0 } = props;

	const delayRef = useRef<HoverDelay>(delay, subSlot(slot, 'delay'));
	const initialDelayRef = useRef<HoverDelay>(delay, subSlot(slot, 'initial'));
	const currentIdRef = useRef<string | null>(null, subSlot(slot, 'id'));
	const currentContextRef = useRef<any>(null, subSlot(slot, 'ctxRef'));
	const timeout = useTimeout(subSlot(slot, 'to'));

	useLayoutEffect(
		() => {
			initialDelayRef.current = delay;

			if (!currentIdRef.current) {
				delayRef.current = delay;
				return;
			}

			// A member is already open: keep the (zeroed) open delay, adopt the new close delay.
			delayRef.current = {
				open: getDelay(delayRef.current, 'open'),
				close: getDelay(delay, 'close'),
			} as HoverDelay;
		},
		[delay, currentIdRef, delayRef, initialDelayRef],
		subSlot(slot, 'l:delay'),
	);

	const contextValue = useMemo(
		() => ({
			hasProvider: true,
			delayRef,
			initialDelayRef,
			currentIdRef,
			timeoutMs,
			currentContextRef,
			timeout,
		}),
		[timeoutMs, timeout],
		subSlot(slot, 'ctx'),
	);

	return createElement(FloatingDelayGroupContext.Provider, { value: contextValue, children });
}

export interface UseDelayGroupReturn {
	delayRef: { current: HoverDelay };
	isInstantPhase: boolean;
	hasProvider: boolean;
}

export function useDelayGroup(...args: any[]): UseDelayGroupReturn {
	const [user, slotArg] = splitSlot(args);
	const slot = slotArg ?? S('useDelayGroup');
	const context = user[0] as any;
	const options = (user[1] as { open: boolean } | undefined) ?? { open: false };

	const { open } = options;

	const store = context != null && 'rootStore' in context ? context.rootStore : context;
	const floatingId = store.useState('floatingId', subSlot(slot, 's:id'));

	const groupContext = useContext(FloatingDelayGroupContext);
	const {
		currentIdRef,
		delayRef,
		timeoutMs,
		initialDelayRef,
		currentContextRef,
		hasProvider,
		timeout,
	} = groupContext;

	const [isInstantPhase, setIsInstantPhase] = useState(false, subSlot(slot, 'instant'));
	const openRef = useRef(open, subSlot(slot, 'open'));
	const isUnmountedRef = useRef(false, subSlot(slot, 'unmounted'));

	useLayoutEffect(
		() => {
			openRef.current = open;
		},
		[open],
		subSlot(slot, 'l:openRef'),
	);

	useLayoutEffect(
		() => {
			return () => {
				isUnmountedRef.current = true;
			};
		},
		[],
		subSlot(slot, 'l:unmount'),
	);

	useLayoutEffect(
		() => {
			function unset() {
				if (!isUnmountedRef.current) {
					setIsInstantPhase(false);
				}
				currentContextRef.current?.setIsInstantPhase(false);
				currentIdRef.current = null;
				currentContextRef.current = null;
				delayRef.current = initialDelayRef.current;
				timeout.clear();
			}

			if (!currentIdRef.current) {
				return undefined;
			}

			if (!open && currentIdRef.current === floatingId) {
				setIsInstantPhase(false);

				if (timeoutMs) {
					const closingId = floatingId;
					timeout.start(timeoutMs, () => {
						// If another tooltip has taken over the group, skip resetting.
						if (
							store.select('open') ||
							(currentIdRef.current && currentIdRef.current !== closingId)
						) {
							return;
						}
						unset();
					});
					return () => {
						if (openRef.current || currentIdRef.current !== closingId) {
							timeout.clear();
						}
					};
				}

				unset();
			}

			return undefined;
		},
		[
			open,
			floatingId,
			currentIdRef,
			delayRef,
			timeoutMs,
			initialDelayRef,
			currentContextRef,
			timeout,
			store,
		],
		subSlot(slot, 'l:close'),
	);

	useLayoutEffect(
		() => {
			if (!open) {
				return;
			}

			const prevContext = currentContextRef.current;
			const prevId = currentIdRef.current;

			// A new tooltip is opening, so cancel any pending timeout that would reset the group's
			// delay back to the initial value.
			timeout.clear();
			currentContextRef.current = { onOpenChange: store.setOpen, setIsInstantPhase };
			currentIdRef.current = floatingId;
			delayRef.current = {
				open: 0,
				close: getDelay(initialDelayRef.current, 'close'),
			} as HoverDelay;

			if (prevId !== null && prevId !== floatingId) {
				setIsInstantPhase(true);
				prevContext?.setIsInstantPhase(true);
				prevContext?.onOpenChange(false, createChangeEventDetails(REASONS.none));
			} else {
				setIsInstantPhase(false);
				prevContext?.setIsInstantPhase(false);
			}
		},
		[open, floatingId, store, currentIdRef, delayRef, initialDelayRef, currentContextRef, timeout],
		subSlot(slot, 'l:open'),
	);

	useLayoutEffect(
		() => {
			return () => {
				if (currentIdRef.current === floatingId) {
					currentContextRef.current = null;

					if (!openRef.current) {
						return;
					}

					currentIdRef.current = null;
					resetDelayRef(delayRef, initialDelayRef);
					timeout.clear();
				}
			};
		},
		[currentContextRef, currentIdRef, delayRef, floatingId, initialDelayRef, timeout],
		subSlot(slot, 'l:teardown'),
	);

	return useMemo(
		() => ({ hasProvider, delayRef, isInstantPhase }),
		[hasProvider, delayRef, isInstantPhase],
		subSlot(slot, 'out'),
	);
}
