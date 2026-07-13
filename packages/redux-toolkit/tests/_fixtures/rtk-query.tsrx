import { createContext, useState } from 'octane';
import { createDispatchHook, createSelectorHook, createStoreHook } from '@octanejs/redux';
import {
	ApiProvider,
	buildCreateApi,
	coreModule,
	createApi,
	fakeBaseQuery,
	reactHooksModule,
	skipToken,
} from '@octanejs/redux-toolkit/query/react';

const delay = () => Promise.resolve();

export const api = createApi({
	reducerPath: 'portApi',
	baseQuery: fakeBaseQuery(),
	tagTypes: ['Value'],
	endpoints: (build) => ({
		getValue: build.query({
			async queryFn(arg) {
				await delay();
				if (arg === 'error') {
					return { error: { status: 500, data: 'failed' } };
				}
				return { data: { id: arg, value: 'value-' + arg } };
			},
			providesTags: (_result, _error, arg) => [
				{ type: 'Value', id: arg },
			],
		}),
		setValue: build.mutation({
			async queryFn(arg) {
				await delay();
				return { data: { id: arg, value: 'mutated-' + arg } };
			},
			invalidatesTags: (_result, _error, arg) => [
				{ type: 'Value', id: arg },
			],
		}),
		getPages: build.infiniteQuery({
			infiniteQueryOptions: {
				initialPageParam: 0,
				getNextPageParam: (_lastPage, _allPages, lastPageParam) => lastPageParam + 1,
				getPreviousPageParam: (_firstPage, _allPages, firstPageParam) => firstPageParam > 0
					? firstPageParam - 1
					: undefined,
				maxPages: 3,
			},
			async queryFn({ queryArg, pageParam }) {
				await delay();
				return { data: queryArg + '-' + pageParam };
			},
		}),
	}),
});

function QueryPanel() @{
	const [arg, setArg] = useState('a');
	// Two calls to the same generated hook through both public access forms are
	// an explicit slot-isolation regression test.
	const first = api.useGetValueQuery(arg);
	const second = api.endpoints.getValue.useQuery('b');
	const selected = api.useGetValueQuery('selected', {
		selectFromResult: (result) => ({ value: result.data?.value }),
	});

	<section id="query">
		<p id="first">
			{'first=' + (first.data?.value || '-') + ':' + first.status}
		</p>
		<p id="second">
			{'second=' + (second.data?.value || '-') + ':' + second.status}
		</p>
		<p id="selected">
			{'selected=' + (selected.value || '-')}
		</p>
		<button id="swap" onClick={() => setArg((value) => value === 'a' ? 'c' : 'a')}>swap</button>
		<button id="refetch" onClick={() => first.refetch()}>refetch</button>
	</section>
}

export function QueryApp() @{
	<ApiProvider api={api} setupListeners={false}>
		<QueryPanel />
	</ApiProvider>
}

function LazyMutationPanel() @{
	const [trigger, lazy] = api.useLazyGetValueQuery();
	const [mutate, mutation] = api.useSetValueMutation();
	<section id="actions">
		<p id="lazy">
			{'lazy=' + (lazy.data?.value || '-') + ':' + lazy.status}
		</p>
		<p id="mutation">
			{'mutation=' + (mutation.data?.value || '-') + ':' + mutation.status}
		</p>
		<button id="load" onClick={() => trigger('lazy')}>load</button>
		<button id="mutate" onClick={() => mutate('mutation')}>mutate</button>
		<button id="reset-lazy" onClick={() => lazy.reset()}>reset lazy</button>
		<button id="reset-mutation" onClick={() => mutation.reset()}>reset mutation</button>
	</section>
}

export function LazyMutationApp() @{
	<ApiProvider api={api} setupListeners={false}>
		<LazyMutationPanel />
	</ApiProvider>
}

function InfinitePanel() @{
	const result = api.useGetPagesInfiniteQuery('page');
	const pages = result.data?.pages.join('|') || '-';
	<section id="infinite">
		<p id="pages">
			{'pages=' + pages + ':' + result.status}
		</p>
		<button id="next" onClick={() => result.fetchNextPage()}>next</button>
		<button id="previous" onClick={() => result.fetchPreviousPage()}>previous</button>
	</section>
}

export function InfiniteApp() @{
	<ApiProvider api={api} setupListeners={false}>
		<InfinitePanel />
	</ApiProvider>
}

function SkipPrefetchPanel() @{
	const [skip, setSkip] = useState(true);
	const conditional = api.useGetValueQuery('conditional', { skip });
	const skippedByToken = api.useGetValueQuery(skipToken);
	const prefetched = api.endpoints.getValue.useQueryState('prefetched');
	const prefetch = api.usePrefetch('getValue');
	<section id="skip-prefetch">
		<p id="conditional">
			{'conditional=' + (conditional.data?.value || '-') + ':' + conditional.status}
		</p>
		<p id="skip-token">
			{'token=' + skippedByToken.status}
		</p>
		<p id="prefetched">
			{'prefetched=' + (prefetched.data?.value || '-') + ':' + prefetched.status}
		</p>
		<button id="start-conditional" onClick={() => setSkip(false)}>start</button>
		<button id="prefetch-value" onClick={() => prefetch('prefetched')}>prefetch</button>
	</section>
}

export function SkipPrefetchApp() @{
	<ApiProvider api={api} setupListeners={false}>
		<SkipPrefetchPanel />
	</ApiProvider>
}

export const CustomReduxContext = createContext(null);
const createCustomApi = buildCreateApi(
	coreModule(),
	reactHooksModule({
		hooks: {
			useDispatch: createDispatchHook(CustomReduxContext),
			useSelector: createSelectorHook(CustomReduxContext),
			useStore: createStoreHook(CustomReduxContext),
		},
	}),
);
export const customApi = createCustomApi({
	reducerPath: 'customContextApi',
	baseQuery: fakeBaseQuery(),
	endpoints: (build) => ({
		getCustom: build.query({
			async queryFn(arg) {
				await delay();
				return { data: 'custom-' + arg };
			},
		}),
	}),
});

function CustomContextPanel() @{
	const result = customApi.useGetCustomQuery('value');
	<p id="custom-context">
		{'custom=' + (result.data || '-') + ':' + result.status}
	</p>
}

export function CustomContextApp() @{
	<ApiProvider api={customApi} context={CustomReduxContext} setupListeners={false}>
		<CustomContextPanel />
	</ApiProvider>
}

export function NestedApiProviderApp() @{
	<ApiProvider api={api} setupListeners={false}>
		<ApiProvider api={api} setupListeners={false}>
			<div>nested</div>
		</ApiProvider>
	</ApiProvider>
}
