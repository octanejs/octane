import { Provider } from '@octanejs/redux';
import { configureStore } from '@octanejs/redux-toolkit';
import { createApi, fakeBaseQuery } from '@octanejs/redux-toolkit/query/react';

export const preloadedApi = createApi({
	reducerPath: 'preloadedApi',
	baseQuery: fakeBaseQuery(),
	endpoints: (build) => ({
		getValue: build.query({
			queryFn: async (arg) => ({ data: 'server-' + arg }),
		}),
	}),
});

export function createPreloadedStore() {
	return configureStore({
		reducer: {
			[preloadedApi.reducerPath]: preloadedApi.reducer,
		},
		middleware: (getDefaultMiddleware) => getDefaultMiddleware().concat(preloadedApi.middleware),
	});
}

function PreloadedResult() @{
	const result = preloadedApi.useGetValueQuery('value');
	<p id="preloaded-result">
		{'result=' + (result.data || '-') + ':' + result.status}
	</p>
}

export function PreloadedApp(props) @{
	<Provider store={props.store}>
		<PreloadedResult />
	</Provider>
}
