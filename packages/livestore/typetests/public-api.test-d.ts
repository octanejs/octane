import type { OctaneNode } from 'octane';
import type {
	LiveListProps,
	StoreRegistryProviderProps,
	UseClientDocumentResult,
} from '../src/mod.ts';
import {
	LiveList,
	StoreRegistryProvider,
	captureStackInfo,
	storeOptions,
	useClientDocument,
	useQuery,
	useQueryRef,
	useStore,
	useStoreRegistry,
	useSyncStatus,
	withReactApi,
} from '../src/mod.ts';

declare function expectType<T>(value: T): void;

expectType<typeof StoreRegistryProvider>(StoreRegistryProvider);
expectType<typeof useStoreRegistry>(useStoreRegistry);
expectType<typeof useStore>(useStore);
expectType<typeof useQuery>(useQuery);
expectType<typeof useQueryRef>(useQueryRef);
expectType<typeof useClientDocument>(useClientDocument);
expectType<typeof useSyncStatus>(useSyncStatus);
expectType<typeof withReactApi>(withReactApi);
expectType<typeof storeOptions>(storeOptions);
expectType<typeof captureStackInfo>(captureStackInfo);
expectType<typeof LiveList>(LiveList);

type ProviderChildren = StoreRegistryProviderProps['children'];
expectType<OctaneNode | undefined>(null as unknown as ProviderChildren);

type DocumentValue = UseClientDocumentResult<any>[0];
expectType<DocumentValue>(null as unknown as DocumentValue);

type ListItems = LiveListProps<any>['items$'];
expectType<ListItems>(null as unknown as ListItems);

// @ts-expect-error storeOptions requires a store definition object
storeOptions(null);

// @ts-expect-error useSyncStatus requires a store option
useSyncStatus({});

// @ts-expect-error LiveList props require items$
const missingItems$: LiveListProps<any> = {
	getKey: function getKey() {
		return 'id';
	},
	renderItem: function renderItem() {
		return null;
	},
	store: null as any,
};

void missingItems$;
