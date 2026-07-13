import type { Middleware } from 'redux';
import { createContext } from 'octane';
import {
	createDispatchHook,
	createSelectorHook,
	createStoreHook,
	type ReactReduxContextValue,
} from '@octanejs/redux';
import { configureStore } from '@octanejs/redux-toolkit';
import { createDynamicMiddleware } from '@octanejs/redux-toolkit/react';
import {
	ApiProvider,
	buildCreateApi,
	coreModule,
	createApi,
	fakeBaseQuery,
	reactHooksModule,
	type TypedUseInfiniteQuery,
	type TypedUseMutation,
	type TypedUseQuery,
} from '@octanejs/redux-toolkit/query/react';

type Equal<Left, Right> =
	(<Value>() => Value extends Left ? 1 : 2) extends <Value>() => Value extends Right ? 1 : 2
		? true
		: false;
type Expect<Value extends true> = Value;

const baseQuery = fakeBaseQuery<{ message: string }>();
const api = createApi({
	baseQuery,
	endpoints: (build) => ({
		getValue: build.query<string, number>({
			queryFn: async (arg) => ({ data: String(arg) }),
		}),
		setValue: build.mutation<{ saved: boolean }, string>({
			queryFn: async () => ({ data: { saved: true } }),
		}),
		getPages: build.infiniteQuery<string, string, number>({
			infiniteQueryOptions: {
				initialPageParam: 0,
				getNextPageParam: (_lastPage, _pages, lastPageParam) => lastPageParam + 1,
			},
			queryFn: async ({ queryArg, pageParam }) => ({
				data: queryArg + pageParam,
			}),
		}),
	}),
});

const typedQueryHook: TypedUseQuery<string, number, typeof baseQuery> = api.useGetValueQuery;
const typedMutationHook: TypedUseMutation<{ saved: boolean }, string, typeof baseQuery> =
	api.useSetValueMutation;
const typedInfiniteHook: TypedUseInfiniteQuery<string, string, number, typeof baseQuery> =
	api.useGetPagesInfiniteQuery;
void typedQueryHook;
void typedMutationHook;
void typedInfiniteHook;

api.useGetValueQuery(1);
api.useSetValueMutation();
api.useGetPagesInfiniteQuery('page');
// @ts-expect-error query arguments retain the endpoint's declared type
api.useGetValueQuery('wrong');
// @ts-expect-error mutation triggers retain the endpoint's declared type
api.useSetValueMutation()[0](123);

const dynamic = createDynamicMiddleware<{ value: number }>();
type TaggedDispatch = (action: { type: 'tagged'; payload: string }) => string;
const taggedMiddleware = (() => (next) => (action) => next(action)) as Middleware<
	TaggedDispatch,
	{ value: number }
>;
const useDispatch = dynamic.createDispatchWithMiddlewareHook(taggedMiddleware);
const dispatch = useDispatch();
const dynamicResult: string = dispatch({ type: 'tagged', payload: 'ok' });
type _DynamicDispatchResult = Expect<Equal<typeof dynamicResult, string>>;
const DynamicContext = createContext<ReactReduxContextValue<{ value: number }> | null>(null);
dynamic.createDispatchWithMiddlewareHookFactory(DynamicContext)(taggedMiddleware);

const store = configureStore({ reducer: () => ({ value: 1 }) });
type _RootState = Expect<Equal<ReturnType<typeof store.getState>, { value: number }>>;

const CustomContext = createContext<ReactReduxContextValue | null>(null);
const createCustomApi = buildCreateApi(
	coreModule(),
	reactHooksModule({
		hooks: {
			useDispatch: createDispatchHook(CustomContext),
			useSelector: createSelectorHook(CustomContext),
			useStore: createStoreHook(CustomContext),
		},
	}),
);
const customApi = createCustomApi({
	baseQuery,
	endpoints: (build) => ({
		custom: build.query<string, void>({
			queryFn: async () => ({ data: 'custom' }),
		}),
	}),
});
customApi.useCustomQuery();
ApiProvider({ api: customApi, context: CustomContext });
