// Port of recharts' state/hooks.ts on @octanejs/redux primitives. The recharts
// variants differ from stock useSelector/useDispatch: OUTSIDE a chart they
// return undefined / a no-op instead of throwing, so components remain usable
// standalone with all props passed explicitly.
import { useContext, useMemo } from 'octane';
import { useSyncExternalStoreWithSelector } from '@octanejs/redux';
import { RechartsReduxContext } from './RechartsReduxContext';
import { splitSlot, subSlot } from '../internal';

const noopDispatch = (a: any) => a;

export function useAppDispatch(): (action: any) => any {
	const context = useContext(RechartsReduxContext);
	if (context) {
		return context.store.dispatch;
	}
	return noopDispatch;
}

const noop = () => {};
const addNestedSubNoop = () => noop;
const refEquality = (a: unknown, b: unknown) => a === b;

export function useAppSelector<T>(selector: (state: any) => T, ...rest: any[]): T | undefined {
	const [, slot] = splitSlot(rest);
	const context = useContext(RechartsReduxContext);
	const outOfContextSelector = useMemo(
		() => {
			if (!context) return noop as (state: any) => undefined;
			return (state: any) => {
				if (state == null) return undefined;
				return selector(state);
			};
		},
		[context, selector],
		subSlot(slot, 'as:memo'),
	);
	return useSyncExternalStoreWithSelector(
		context ? context.subscription.addNestedSub : addNestedSubNoop,
		context ? context.store.getState : noop,
		context ? context.store.getState : noop,
		outOfContextSelector,
		refEquality,
		subSlot(slot, 'as:ws'),
	) as T | undefined;
}
