import {
	useLayoutSnapshot,
	type LayoutSnapshotOptions,
	type LayoutSnapshotOptionsWithInitial,
} from 'octane';
import {
	useLayoutSnapshot as useServerLayoutSnapshot,
	type LayoutSnapshotOptionsWithInitial as ServerLayoutSnapshotOptionsWithInitial,
} from 'octane/server';

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
useLayoutSnapshot(() => ({ width: 1 }), {
	// @ts-expect-error Without an initial value, the first previous snapshot is undefined.
	equal: (previous, next) => previous.width === next.width,
});

// A reusable options object keeps its initial-value guarantee through its type.
interface Size {
	width: number;
}
const sized: LayoutSnapshotOptionsWithInitial<Size> = {
	initial: { width: 0 },
	equal: (previous, next) => previous.width === next.width,
};
const sizedSnapshot: Size = useLayoutSnapshot(() => ({ width: 1 }), sized);
const serverSized: ServerLayoutSnapshotOptionsWithInitial<Size> = sized;
const serverSizedSnapshot: Size = useServerLayoutSnapshot(() => ({ width: 1 }), serverSized);
const optional: LayoutSnapshotOptions<Size> = { initial: { width: 0 } };
const optionalSnapshot: Size | undefined = useLayoutSnapshot(() => ({ width: 1 }), optional);
// @ts-expect-error An optional initial value cannot guarantee a defined snapshot.
const wrongOptional: Size = useLayoutSnapshot(() => ({ width: 1 }), optional);

const opaque = () => 'value';
const functionSnapshot: () => string = useLayoutSnapshot(() => opaque, { initial: opaque });

void [
	initial,
	serverInitial,
	withoutInitial,
	withoutServerInitial,
	sizedSnapshot,
	serverSizedSnapshot,
	optionalSnapshot,
	functionSnapshot,
];
