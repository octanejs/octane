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

import { S, splitSlot, subSlot } from './internal';
import { getDelay, useModernLayoutEffect } from './utils';

const NOOP = () => {};
export const FloatingDelayGroupContext = createContext<any>({
	delay: 0,
	initialDelay: 0,
	timeoutMs: 0,
	currentId: null,
	setCurrentId: NOOP,
	setState: NOOP,
	isInstantPhase: false,
});

export const useDelayGroupContext = () => useContext(FloatingDelayGroupContext);

export function FloatingDelayGroup(props: any): any {
	const children = props.children;
	const delay = props.delay;
	const timeoutMs = props.timeoutMs ?? 0;

	const [state, setState] = useReducer(
		(prev: any, next: any) => ({ ...prev, ...next }),
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
	const value = useMemo(
		() => ({ ...state, setState, setCurrentId }),
		[state, setCurrentId],
		S('FloatingDelayGroup:value'),
	);
	return createElement(FloatingDelayGroupContext.Provider, { value, children });
}

export function useDelayGroup(...args: any[]): any {
	const [user, slot] = splitSlot(args);
	const context = user[0];
	const options = (user[1] as any) ?? {};

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
