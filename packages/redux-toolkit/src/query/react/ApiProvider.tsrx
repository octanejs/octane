// Port of RTK Query's ApiProvider. It owns an isolated Toolkit store and uses
// @octanejs/redux's Provider; query hooks can also use a caller-supplied context.
import { useContext, useEffect, useState } from 'octane';
import type { Context, OctaneNode } from 'octane';
import { configureStore } from '@reduxjs/toolkit';
import { Provider, ReactReduxContext, type ReactReduxContextValue } from '@octanejs/redux';
import { setupListeners, type Api } from '@reduxjs/toolkit/query';

export function ApiProvider(props: {
	children?: OctaneNode;
	api: Api<any, {}, any, any>;
	setupListeners?: Parameters<typeof setupListeners>[1] | false;
	context?: Context<ReactReduxContextValue | null>;
}) @{
	const context = props.context || ReactReduxContext;
	const existingContext = useContext(context);
	if (existingContext) {
		throw new Error('Existing Redux context detected. If you already have a store set up, please use the traditional Redux setup.');
	}

	const [store] = useState(
		() => configureStore({
			reducer: {
				[props.api.reducerPath]: props.api.reducer,
			},
			middleware: (getDefaultMiddleware) => getDefaultMiddleware().concat(props.api.middleware),
		}),
	);

	useEffect(
		() => props.setupListeners === false
			? undefined
			: setupListeners(store.dispatch, props.setupListeners),
		[props.setupListeners, store.dispatch],
	);

	<Provider store={store} context={context}>{props.children}</Provider>
}
