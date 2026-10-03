import { useLayoutSnapshot } from 'octane';
import { useLayoutSnapshot as useServerLayoutSnapshot } from 'octane/server';

const initial: number = useLayoutSnapshot(() => 1, { initial: 0 });
const serverInitial: number = useServerLayoutSnapshot(() => 1, { initial: 0 });
const withoutInitial: number | undefined = useLayoutSnapshot(() => 1);
const withoutServerInitial: number | undefined = useServerLayoutSnapshot(() => 1);

// Without an initial value, the first snapshot can be undefined on both paths.
// @ts-expect-error The client return must include undefined.
const wrongClient: number = useLayoutSnapshot(() => 1);
// @ts-expect-error The server return must include undefined.
const wrongServer: number = useServerLayoutSnapshot(() => 1);

useLayoutSnapshot(() => ({ width: 1 }), {
	initial: { width: 0 },
	equal: (previous, next) => previous.width === next.width,
});
useLayoutSnapshot(() => ({ width: 1 }), {
	equal: (previous, next) => previous?.width === next.width,
});

const opaque = () => 'value';
const functionSnapshot: () => string = useLayoutSnapshot(() => opaque, { initial: opaque });

void [initial, serverInitial, withoutInitial, withoutServerInitial, functionSnapshot];
