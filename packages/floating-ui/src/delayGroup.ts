// Ported from @floating-ui/react FloatingDelayGroup + useDelayGroup — share a single
// open/close delay across a group of floating elements. `.ts` component via
// createElement; useDelayGroup is a hook (resolves its own slot).
import {
	createContext,
	createElement,
	useCallback,
	useContext,
	useMemo,
	useReducer,
	useRef,
} from 'octane';
import type { OctaneNode } from 'octane';

import { S, splitSlot, subSlot } from './internal';
import { getDelay, useModernLayoutEffect } from './utils';
import type { Delay, FloatingRootContext } from './types';

export interface GroupState {
	delay: Delay;
	initialDelay: Delay;
	currentId: any;
	timeoutMs: number;
	isInstantPhase: boolean;
}

export interface GroupContext extends GroupState {
	setCurrentId: (currentId: any) => void;
	setState: (state: Partial<GroupState>) => void;
}

export interface UseGroupOptions {
	/**
	 * Whether delay grouping should be enabled.
	 * @default true
	 */
	enabled?: boolean;
	id?: any;
}

const NOOP = () => {};
export const FloatingDelayGroupContext = createContext<GroupContext>({
	delay: 0,
	initialDelay: 0,
	timeoutMs: 0,
	currentId: null,
	setCurrentId: NOOP,
	setState: NOOP,
	isInstantPhase: false,
});

/**
 * @deprecated
 * Use the return value of `useDelayGroup()` instead.
 */
export const useDelayGroupContext = (): GroupContext => useContext(FloatingDelayGroupContext);

export interface FloatingDelayGroupProps {
	children?: OctaneNode;
	/**
	 * The delay to use for the group.
	 */
	delay: Delay;
	/**
	 * An optional explicit timeout to use for the group, which represents when
	 * grouping logic will no longer be active after the close delay completes.
	 * This is useful if you want grouping to “last” longer than the close delay,
	 * for example if there is no close delay at all.
	 */
	timeoutMs?: number;
}

/**
 * Provides context for a group of floating elements that should share a
 * `delay`.
 * @see https://floating-ui.com/docs/FloatingDelayGroup
 */
export function FloatingDelayGroup(props: FloatingDelayGroupProps): OctaneNode {
	const children = props.children;
	const delay = props.delay;
	const timeoutMs = props.timeoutMs ?? 0;

	const [state, setState] = useReducer(
		(prev: GroupState, next: Partial<GroupState>): GroupState => ({ ...prev, ...next }),
		{
			delay,
			timeoutMs,
			initialDelay: delay,
			currentId: null,
			isInstantPhase: false,
		},
		S('FloatingDelayGroup:state'),
	);
	const initialCurrentIdRef = useRef<any>(null, S('FloatingDelayGroup:initialId'));
	const setCurrentId = useCallback(
		(currentId: any) => {
			setState({ currentId });
		},
		[],
		S('FloatingDelayGroup:setId'),
	);
	useModernLayoutEffect(
		() => {
			if (state.currentId) {
				if (initialCurrentIdRef.current === null) {
					initialCurrentIdRef.current = state.currentId;
				} else if (!state.isInstantPhase) {
					setState({ isInstantPhase: true });
				}
			} else {
				if (state.isInstantPhase) {
					setState({ isInstantPhase: false });
				}
				initialCurrentIdRef.current = null;
			}
		},
		[state.currentId, state.isInstantPhase],
		S('FloatingDelayGroup:eff'),
	);
	const value = useMemo<GroupContext>(
		() => ({ ...state, setState, setCurrentId }),
		[state, setCurrentId],
		S('FloatingDelayGroup:value'),
	);
	return createElement(FloatingDelayGroupContext.Provider, { value, children });
}

/**
 * Enables grouping when called inside a component that's a child of a
 * `FloatingDelayGroup`.
 * @see https://floating-ui.com/docs/FloatingDelayGroup
 */
export function useDelayGroup(
	context: FloatingRootContext,
	options?: UseGroupOptions,
	slot?: symbol,
): GroupContext;
export function useDelayGroup(...args: any[]): GroupContext {
	const [user, slot] = splitSlot(args);
	const context = user[0] as FloatingRootContext;
	const options = (user[1] as UseGroupOptions) ?? {};

	const open = context.open;
	const onOpenChange = context.onOpenChange;
	const floatingId = context.floatingId;
	const optionId = options.id;
	const enabled = options.enabled ?? true;
	const id = optionId != null ? optionId : floatingId;
	const groupContext = useDelayGroupContext();
	const { currentId, setCurrentId, initialDelay, setState, timeoutMs } = groupContext;

	useModernLayoutEffect(
		() => {
			if (!enabled) return;
			if (!currentId) return;
			setState({
				delay: { open: 1, close: getDelay(initialDelay, 'close') },
			});
			if (currentId !== id) {
				onOpenChange(false);
			}
		},
		[enabled, id, onOpenChange, setState, currentId, initialDelay],
		subSlot(slot, 'e:sync'),
	);

	useModernLayoutEffect(
		() => {
			function unset() {
				onOpenChange(false);
				setState({ delay: initialDelay, currentId: null });
			}
			if (!enabled) return;
			if (!currentId) return;
			if (!open && currentId === id) {
				if (timeoutMs) {
					const timeout = window.setTimeout(unset, timeoutMs);
					return () => {
						clearTimeout(timeout);
					};
				}
				unset();
			}
		},
		[enabled, open, setState, currentId, id, onOpenChange, initialDelay, timeoutMs],
		subSlot(slot, 'e:unset'),
	);

	useModernLayoutEffect(
		() => {
			if (!enabled) return;
			if (setCurrentId === NOOP || !open) return;
			setCurrentId(id);
		},
		[enabled, open, setCurrentId, id],
		subSlot(slot, 'e:set'),
	);

	return groupContext;
}
