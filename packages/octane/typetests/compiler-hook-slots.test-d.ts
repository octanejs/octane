import * as client from 'octane';
import * as server from 'octane/server';
import type { SSRScope } from 'octane/internal/server';

// Compiled component hooks use numeric slots; plain custom-hook modules retain
// Symbol slots. Both forms keep the authored generic value and update types.
for (const slot of [client.hookSlots(32), Symbol('hook')]) {
	const [value, update, read] = client.__useStateWithGetter<string | null>(null, slot);
	const [serverValue, serverUpdate, serverRead] = server.__useStateWithGetter<string | null>(
		null,
		slot,
	);
	const values: (string | null)[] = [value, read(), serverValue, serverRead()];
	update((previous) => previous?.toUpperCase() ?? 'ready');
	serverUpdate((previous) => previous?.toUpperCase() ?? 'ready');
	// @ts-expect-error Numeric compiler slots must not erase the client state type.
	update(1);
	// @ts-expect-error The server getter variant retains the public updater contract.
	serverUpdate(1);
	// @ts-expect-error The server updater callback must return the state type.
	serverUpdate(() => 1);

	const [state] = client.useState('state', slot);
	const [serverState] = server.useState('state', slot);
	const callback = client.useCallback((value: string) => value.length, [], slot);
	const serverCallback = server.useCallback((value: string) => value.length, [], slot);
	const numbers: number[] = [
		client.useMemo(() => state.length, [], slot),
		server.useMemo(() => serverState.length, [], slot),
		callback('ready'),
		serverCallback('ready'),
		client.withSlot(slot, () => 1),
		server.withSlot(slot, () => 1),
		client.useRef(1, slot).current,
		server.useRef(1, slot).current,
		client.useLazyRef(() => 1, slot).current,
		server.useLazyRef(() => 1, slot).current,
		client.useLayoutSnapshot(() => 1, { initial: 0 }, slot),
		server.useLayoutSnapshot(() => 1, { initial: 0 }, slot),
	];
	// @ts-expect-error Slot acceptance must preserve callback parameter types.
	serverCallback(1);
	// @ts-expect-error Slot acceptance must preserve memo result types.
	const wrongMemo: string = server.useMemo(() => 1, [], slot);

	const reducer = (state: number, action: number) => state + action;
	client.useReducer(reducer, 0, undefined, slot)[1](1);
	server.useReducer(reducer, 0, undefined, slot)[1](1);
	client.__useReducerWithGetter(reducer, 0, undefined, slot)[1](1);
	server.__useReducerWithGetter(reducer, 0, undefined, slot)[1](1);
	client.useLinkedState(1, (value) => value.toString(), undefined, slot)[1]('next');
	server.useLinkedState(1, (value) => value.toString(), undefined, slot)[1]('next');
	client.__useLinkedStateWithGetter(1, (value) => value.toString(), undefined, slot)[1]('next');
	server.__useLinkedStateWithGetter(1, (value) => value.toString(), undefined, slot)[1]('next');

	client.useEffect(() => {}, [], slot);
	server.useEffect(() => {}, [], slot);
	client.useLayoutEffect(() => {}, [], slot);
	server.useLayoutEffect(() => {}, [], slot);
	client.useInsertionEffect(() => {}, [], slot);
	server.useInsertionEffect(() => {}, [], slot);
	client.useImperativeHandle({ current: null as number | null }, () => 1, [], slot);
	server.useImperativeHandle({ current: null as number | null }, () => 1, [], slot);
	client.useDebugValue('state', undefined, slot);
	server.useDebugValue('state', undefined, slot);
	client.useEffectEvent((value: number) => value + 1, slot)(1);
	server.useEffectEvent((value: number) => value + 1, slot)(1);
	client.useId(slot);
	server.useId(slot);
	client.useTransition(slot);
	server.useTransition(slot);
	client.useFormStatus(slot);
	server.useFormStatus(slot);
	client.useActionState((state: number) => state + 1, 0, undefined, slot);
	server.useActionState((state: number) => state + 1, 0, undefined, slot);
	client.useOptimistic(0, reducer, slot)[1](1);
	server.useOptimistic(0, reducer, slot)[1](1);
	client.useSyncExternalStore(
		() => () => {},
		() => 1,
		() => 1,
		slot,
	);
	server.useSyncExternalStore(
		() => () => {},
		() => 1,
		() => 1,
		slot,
	);
	server.use(Promise.resolve(1), slot);

	// @ts-expect-error Effects cannot return promises on either rendering target.
	server.useEffect(async () => {}, [], slot);
	// @ts-expect-error An imperative ref must accept the factory's return type.
	server.useImperativeHandle({ current: null as string | null }, () => 1, [], slot);
}

declare const scope: SSRScope;
const parent: SSRScope | null = scope.parent;

// @ts-expect-error Compiler slots retain a concrete token type on the client.
client.useState(1, {});
// @ts-expect-error Compiler slots retain a concrete token type on the server.
server.useState(1, {});
