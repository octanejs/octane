// Ported from .base-ui/packages/react/src/utils/closePart.tsx (v1.6.0), octane-adapted
// (slot-threaded plain-`.ts`). Tracks how many "close" parts (e.g. `Popover.Close`) are mounted
// inside a popup so the focus manager can decide whether the popup is effectively modal.
import {
	createContext,
	useContext,
	useState,
	useMemo,
	useLayoutEffect,
	createElement,
} from 'octane';

import { S, subSlot } from '../internal';
import { useStableCallback } from './useStableCallback';

interface ClosePartContextValue {
	register: () => () => void;
}

const ClosePartContext = createContext<ClosePartContextValue | undefined>(undefined);

export function useClosePartCount(): { context: ClosePartContextValue; hasClosePart: boolean } {
	const slot = S('useClosePartCount');
	const [closePartCount, setClosePartCount] = useState(0, subSlot(slot, 'count'));

	const register = useStableCallback(
		() => {
			setClosePartCount((count: number) => count + 1);
			return () => {
				setClosePartCount((count: number) => Math.max(0, count - 1));
			};
		},
		subSlot(slot, 'reg'),
	);

	const context = useMemo(() => ({ register }), [register], subSlot(slot, 'ctx'));

	return {
		context,
		hasClosePart: closePartCount > 0,
	};
}

export function ClosePartProvider(props: { value: ClosePartContextValue; children?: any }): any {
	return createElement(ClosePartContext.Provider, {
		value: props.value,
		children: props.children,
	});
}

export function useClosePartRegistration(): void {
	const slot = S('useClosePartRegistration');
	const context = useContext(ClosePartContext);
	useLayoutEffect(
		() => {
			return context?.register();
		},
		[context],
		subSlot(slot, 'eff'),
	);
}
