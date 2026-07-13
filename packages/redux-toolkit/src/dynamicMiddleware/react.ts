// Port of @reduxjs/toolkit@2.12.0 dynamicMiddleware/react. The middleware core
// is reused verbatim; only the dispatch-hook factory swaps react-redux for the
// octane binding.
import type {
	DynamicMiddlewareInstance,
	GetDispatch,
	GetState,
	MiddlewareApiConfig,
	TSHelpersExtractDispatchExtensions,
} from '@reduxjs/toolkit';
import { createDynamicMiddleware as createCoreDynamicMiddleware } from '@reduxjs/toolkit';
import type { Context } from 'octane';
import type { ReactReduxContextValue } from '@octanejs/redux';
import {
	createDispatchHook,
	ReactReduxContext,
	useDispatch as useDefaultDispatch,
} from '@octanejs/redux';
import type { Action, Dispatch, Middleware, UnknownAction } from 'redux';

export type UseDispatchWithMiddlewareHook<
	Middlewares extends Middleware<any, State, DispatchType>[] = [],
	State = any,
	DispatchType extends Dispatch<UnknownAction> = Dispatch<UnknownAction>,
> = () => TSHelpersExtractDispatchExtensions<Middlewares> & DispatchType;

export type CreateDispatchWithMiddlewareHook<
	State = any,
	DispatchType extends Dispatch<UnknownAction> = Dispatch<UnknownAction>,
> = {
	<
		Middlewares extends [
			Middleware<any, State, DispatchType>,
			...Middleware<any, State, DispatchType>[],
		],
	>(
		...middlewares: Middlewares
	): UseDispatchWithMiddlewareHook<Middlewares, State, DispatchType>;
	withTypes<MiddlewareConfig extends MiddlewareApiConfig>(): CreateDispatchWithMiddlewareHook<
		GetState<MiddlewareConfig>,
		GetDispatch<MiddlewareConfig>
	>;
};

type ActionFromDispatch<DispatchType extends Dispatch<Action>> =
	DispatchType extends Dispatch<infer DispatchedAction> ? DispatchedAction : never;

type OctaneDynamicMiddlewareInstance<
	State = any,
	DispatchType extends Dispatch<UnknownAction> = Dispatch<UnknownAction>,
> = DynamicMiddlewareInstance<State, DispatchType> & {
	createDispatchWithMiddlewareHookFactory: (
		context?: Context<ReactReduxContextValue<State, ActionFromDispatch<DispatchType>> | null>,
	) => CreateDispatchWithMiddlewareHook<State, DispatchType>;
	createDispatchWithMiddlewareHook: CreateDispatchWithMiddlewareHook<State, DispatchType>;
};

export const createDynamicMiddleware = <
	State = any,
	DispatchType extends Dispatch<UnknownAction> = Dispatch<UnknownAction>,
>(): OctaneDynamicMiddlewareInstance<State, DispatchType> => {
	const instance = createCoreDynamicMiddleware<State, DispatchType>();
	const createDispatchWithMiddlewareHookFactory = (
		context: Context<ReactReduxContextValue<
			State,
			ActionFromDispatch<DispatchType>
		> | null> = ReactReduxContext as Context<ReactReduxContextValue<
			State,
			ActionFromDispatch<DispatchType>
		> | null>,
	) => {
		const useDispatch =
			context === ReactReduxContext
				? useDefaultDispatch
				: createDispatchHook<State, ActionFromDispatch<DispatchType>>(context as any);

		function createDispatchWithMiddlewareHook<
			Middlewares extends Middleware<any, State, DispatchType>[],
		>(...middlewares: Middlewares) {
			instance.addMiddleware(...middlewares);
			return useDispatch;
		}
		createDispatchWithMiddlewareHook.withTypes = () => createDispatchWithMiddlewareHook;
		return createDispatchWithMiddlewareHook as CreateDispatchWithMiddlewareHook<
			State,
			DispatchType
		>;
	};

	const createDispatchWithMiddlewareHook = createDispatchWithMiddlewareHookFactory();

	return {
		...instance,
		createDispatchWithMiddlewareHookFactory,
		createDispatchWithMiddlewareHook,
	};
};
