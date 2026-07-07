// Provider — port of react-redux's components/Provider.tsx. Builds the context
// value ({ store, subscription, getServerState? }) once per store, wires the
// subscription in a layout effect (subscribes to the store, re-notifies nested
// subs if the state moved between render and effect), and supports the
// `context` prop for library-owned stores (recharts-style custom contexts).
import { useMemo, useLayoutEffect } from 'octane';
import { ReactReduxContext } from './Context.ts';
import { createSubscription } from './utils/Subscription.ts';

export function Provider(props) @{
	const { store, context, serverState, children } = props;

	const contextValue = useMemo(() => {
		const subscription = createSubscription(store);
		return {
			store,
			subscription,
			getServerState: serverState ? () => serverState : undefined,
		};
	}, [store, serverState]);

	const previousState = useMemo(() => store.getState(), [store]);

	useLayoutEffect(() => {
		const { subscription } = contextValue;
		subscription.onStateChange = subscription.notifyNestedSubs;
		subscription.trySubscribe();
		if (previousState !== store.getState()) {
			subscription.notifyNestedSubs();
		}
		return () => {
			subscription.tryUnsubscribe();
			subscription.onStateChange = undefined;
		};
	}, [contextValue, previousState]);

	const Context = context || ReactReduxContext;

	<Context.Provider value={contextValue}>{children}</Context.Provider>
}
