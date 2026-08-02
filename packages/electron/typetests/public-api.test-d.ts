import {
	type InvokeState,
	type OctaneElectronAPI,
	type UseInvokeOptions,
	type UseIpcEventOptions,
	type WindowState,
	ElectronUnavailableError,
	app,
	setElectronBridgeKey,
	shell,
	useInvoke,
	useInvokeState,
	useIpcEvent,
	useNativeTheme,
	useWindowState,
} from '@octanejs/electron';

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

useIpcEvent('item-added', (...args) => {
	expectType<unknown[]>(args);
});

useIpcEvent('item-added', () => {}, {
	enabled: false,
	onError: (error) => expectType<unknown>(error),
});

expectType<boolean>(useNativeTheme());
expectType<WindowState>(useWindowState());
expectType<Promise<string>>(app.getVersion());
expectType<Promise<void>>(shell.openExternal('https://example.com'));

declare const invokeOptions: UseInvokeOptions;
declare const eventOptions: UseIpcEventOptions;
declare const api: OctaneElectronAPI;
expectType<readonly unknown[] | undefined>(invokeOptions.deps);
expectType<boolean | undefined>(eventOptions.enabled);
expectType<InvokeState<Item[]>>(state);
expectType<Error>(new ElectronUnavailableError('useInvoke'));
expectType<(channel: string, ...args: unknown[]) => Promise<unknown>>(api.invoke);
expectType<void>(setElectronBridgeKey('myElectronAPI'));
expectType<void>(setElectronBridgeKey());
