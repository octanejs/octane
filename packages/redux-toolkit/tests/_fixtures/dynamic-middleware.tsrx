import { Provider, useSelector } from '@octanejs/redux';
import { configureStore, createDynamicMiddleware } from '@octanejs/redux-toolkit/react';

export const observedActions = [];

const dynamicMiddleware = createDynamicMiddleware();
const observer = () => (next) => (action) => {
	observedActions.push(action.type);
	return next(action);
};

const useEnhancedDispatch = dynamicMiddleware.createDispatchWithMiddlewareHook(observer);

export const store = configureStore({
	reducer: (state = { value: 0 }, action) => action.type === 'counter/increment'
		? { value: state.value + 1 }
		: state,
	middleware: (getDefaultMiddleware) => getDefaultMiddleware().prepend(
		dynamicMiddleware.middleware,
	),
});

function DynamicMiddlewarePanel() @{
	const count = useSelector((state) => state.value);
	const dispatch = useEnhancedDispatch();
	<button id="dynamic-dispatch" onClick={() => dispatch({ type: 'counter/increment' })}>
		{'count=' + count}
	</button>
}

export function DynamicMiddlewareApp() @{
	<Provider store={store}>
		<DynamicMiddlewarePanel />
	</Provider>
}
