import {
	Fragment,
	cloneElement,
	createContext,
	createElement,
	isValidElement,
	useContext,
	useEffect,
	useInsertionEffect,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
	useSyncExternalStore,
} from 'octane';
import { splitSlot, subSlot } from './internal';

export {
	Fragment,
	cloneElement,
	createContext,
	createElement,
	isValidElement,
	useContext,
	useMemo,
	useRef,
	useState,
	useSyncExternalStore,
};

const canUseDOM = !!(
	typeof window !== 'undefined' &&
	typeof window.document !== 'undefined' &&
	typeof window.document.createElement !== 'undefined'
);

export const useIsomorphicLayoutEffect = canUseDOM ? useLayoutEffect : useEffect;

export function useEvent<T extends (...args: any[]) => any>(fn: T): T;
export function useEvent<T extends (...args: any[]) => any>(fn: T, slot: symbol): T;
export function useEvent<T extends (...args: any[]) => any>(fn: T, ...rest: [slot?: symbol]): T {
	const [, slot] = splitSlot(rest);
	const ref = useRef<[T, T] | undefined>(undefined, subSlot(slot, 'use-event:ref'));

	if (ref.current === undefined) {
		const pair = [fn, ((...args: Parameters<T>) => pair[0](...args)) as T] as [T, T];
		ref.current = pair;
	}

	useInsertionEffect(
		() => {
			ref.current![0] = fn;
		},
		undefined,
		subSlot(slot, 'use-event:insertion-effect'),
	);

	return ref.current[1];
}
