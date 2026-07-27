import {
	type Event,
	type InvokeArgs,
	type InvokeState,
	TauriUnavailableError,
	type UseInvokeOptions,
	type UseTauriEventOptions,
	useInvoke,
	useInvokeState,
	useTauriEvent,
} from '@octanejs/tauri';

declare function expectType<T>(value: T): void;

type Item = { id: number; name: string };

const listed = useInvoke<Item[]>('list_items');
expectType<Item[]>(listed);

const filtered = useInvoke<Item[]>('list_items', { query: 'a' }, { deps: ['a'] });
expectType<Item[]>(filtered);

const state = useInvokeState<Item[]>('list_items', { query: 'a' });
expectType<'pending' | 'success' | 'error'>(state.status);
expectType<Item[] | undefined>(state.data);
expectType<unknown>(state.error);
expectType<() => void>(state.refetch);

useTauriEvent<Item>('item-added', (received) => {
	expectType<Event<Item>>(received);
	expectType<Item>(received.payload);
});

useTauriEvent<Item>('item-added', () => {}, {
	target: 'main',
	enabled: false,
	onError: (error) => expectType<unknown>(error),
});

declare const args: InvokeArgs;
declare const invokeOptions: UseInvokeOptions;
declare const eventOptions: UseTauriEventOptions;
expectType<InvokeArgs>(args);
expectType<readonly unknown[] | undefined>(invokeOptions.deps);
expectType<boolean | undefined>(eventOptions.enabled);
expectType<InvokeState<Item[]>>(state);
expectType<Error>(new TauriUnavailableError('useInvoke'));
