// The hooks layer — port of react-redux's hooks/{useReduxContext,useStore,
// useDispatch,useSelector}.ts, including the context-parameterized factory
// forms (createStoreHook/createDispatchHook/createSelectorHook) that libraries
// use to run an isolated store on a custom context (recharts does exactly
// this). Dev checks (missing selector / non-function equality / no Provider)
// are kept; upstream's stability/identity-function dev warnings are kept in
// their "once" form.
import { useContext, useCallback, useRef } from 'octane';
import type { Action, Store, UnknownAction } from 'redux';
import { ReactReduxContext } from './Context';
import type { ReactReduxContextValue } from './Context';
import { useSyncExternalStoreWithSelector } from './utils/useSyncExternalStoreWithSelector';
import { splitSlot, subSlot } from './internal';

const refEquality = (a: unknown, b: unknown) => a === b;

// useReduxContext — throws without a <Provider> (upstream parity). Context
// reads are keyed by context identity in octane, so no slot is needed.
export function createReduxContextHook(context = ReactReduxContext) {
	return function useReduxContext(): ReactReduxContextValue {
		const contextValue = useContext(context);
		if (process.env.NODE_ENV !== 'production' && !contextValue) {
			throw new Error(
				'could not find @octanejs/redux context value; please ensure the component is wrapped in a <Provider>',
			);
		}
		return contextValue as ReactReduxContextValue;
	};
}

export const useReduxContext = /* @__PURE__ */ createReduxContextHook();

export function createStoreHook<S = unknown, A extends Action<string> = UnknownAction>(
	context = ReactReduxContext,
) {
	const useReduxContextLocal =
		context === ReactReduxContext ? useReduxContext : createReduxContextHook(context);
	const useStore = () => {
		const { store } = useReduxContextLocal();
		return store as Store<S, A>;
	};
	Object.assign(useStore, { withTypes: () => useStore });
	return useStore;
}

export const useStore = /* @__PURE__ */ createStoreHook();

export function createDispatchHook<S = unknown, A extends Action<string> = UnknownAction>(
	context = ReactReduxContext,
) {
	const useStoreLocal = context === ReactReduxContext ? useStore : createStoreHook<S, A>(context);
	const useDispatch = () => {
		const store = useStoreLocal();
		return store.dispatch;
	};
	Object.assign(useDispatch, { withTypes: () => useDispatch });
	return useDispatch;
}

export const useDispatch = /* @__PURE__ */ createDispatchHook();

interface UseSelectorOptions<Selected> {
	equalityFn?: (a: Selected, b: Selected) => boolean;
	devModeChecks?: {
		stabilityCheck?: 'never' | 'once' | 'always';
		identityFunctionCheck?: 'never' | 'once' | 'always';
	};
}

export function createSelectorHook(context = ReactReduxContext) {
	const useReduxContextLocal =
		context === ReactReduxContext ? useReduxContext : createReduxContextHook(context);

	function useSelector<TState, Selected>(
		selector: (state: TState) => Selected,
		...rest: any[]
	): Selected {
		const [user, slot] = splitSlot(rest);
		const equalityFnOrOptions = (user[0] ?? {}) as
			((a: Selected, b: Selected) => boolean) | UseSelectorOptions<Selected>;
		const { equalityFn = refEquality } =
			typeof equalityFnOrOptions === 'function'
				? { equalityFn: equalityFnOrOptions }
				: equalityFnOrOptions;

		if (process.env.NODE_ENV !== 'production') {
			if (!selector) {
				throw new Error(`You must pass a selector to useSelector`);
			}
			if (typeof selector !== 'function') {
				throw new Error(`You must pass a function as a selector to useSelector`);
			}
			if (typeof equalityFn !== 'function') {
				throw new Error(`You must pass a function as an equality function to useSelector`);
			}
		}

		const { store, subscription, getServerState } = useReduxContextLocal();

		const firstRun = useRef(true, subSlot(slot, 'us:first'));

		const wrappedSelector = useCallback(
			(state: TState): Selected => {
				const selected = selector(state);
				if (process.env.NODE_ENV !== 'production') {
					const { devModeChecks = {} } =
						typeof equalityFnOrOptions === 'function' ? {} : (equalityFnOrOptions as any);
					const {
						stabilityCheck = 'once',
						identityFunctionCheck = 'once',
					}: NonNullable<UseSelectorOptions<Selected>['devModeChecks']> = devModeChecks;
					if (stabilityCheck === 'always' || (stabilityCheck === 'once' && firstRun.current)) {
						const toCompare = selector(state);
						if (!equalityFn(selected, toCompare)) {
							console.warn(
								'Selector ' +
									(selector.name || 'unknown') +
									' returned a different result when called with the same parameters. This can lead to unnecessary rerenders.' +
									'\nSelectors that return a new reference (such as an object or an array) should be memoized: https://redux.js.org/usage/deriving-data-selectors#optimizing-selectors-with-memoization',
								{ state, selected, selected2: toCompare },
							);
						}
					}
					if (
						identityFunctionCheck === 'always' ||
						(identityFunctionCheck === 'once' && firstRun.current)
					) {
						if ((selected as unknown) === state) {
							console.warn(
								'Selector ' +
									(selector.name || 'unknown') +
									' returned the root state when called. This can lead to unnecessary rerenders.' +
									'\nSelectors that return the entire state are almost certainly a mistake, as they will cause a rerender whenever *anything* in state changes.',
							);
						}
					}
					if (firstRun.current) firstRun.current = false;
				}
				return selected;
			},
			[selector],
			subSlot(slot, 'us:sel'),
		);

		const selectedState = useSyncExternalStoreWithSelector(
			subscription.addNestedSub,
			store.getState as () => TState,
			(getServerState as (() => TState) | undefined) || (store.getState as () => TState),
			wrappedSelector,
			equalityFn,
			subSlot(slot, 'us:ws'),
		);

		return selectedState;
	}

	Object.assign(useSelector, { withTypes: () => useSelector });
	return useSelector;
}

export const useSelector = /* @__PURE__ */ createSelectorHook();
