import {
	type LinkedStateOptions,
	type LinkedStatePrevious,
	useEffect,
	useImperativeHandle,
	useLinkedState,
} from 'octane';
import { useLinkedState as useServerLinkedState } from 'octane/server';
import { useLinkedState as useUniversalLinkedState } from 'octane/universal';
import type { Octane } from 'octane/jsx-runtime';

declare const nativeRefArray: Octane.Ref<HTMLDivElement>;
useImperativeHandle(nativeRefArray, () => document.createElement('div'));
useImperativeHandle([null, [{ current: null as number | null }, undefined]], () => 42);
useImperativeHandle(
	[
		[
			(value: number | null) => {
				value?.toFixed();
			},
		],
	],
	() => 42,
);
// @ts-expect-error — each nested ref must accept the handle returned by the factory.
useImperativeHandle([{ current: null as HTMLDivElement | null }], () => 42);
// @ts-expect-error — a callback ref cannot receive an incompatible primitive handle.
useImperativeHandle([[(value: string | null) => {}]], () => 42);

useEffect(() => {});
useEffect(() => () => {});

// Effects must start synchronously so the returned value can be interpreted as
// an optional cleanup. Start async work inside the body instead.
// @ts-expect-error — an async effect returns a Promise, not an optional cleanup.
useEffect(async () => {});

// @ts-expect-error — an effect may return only undefined or a cleanup function.
useEffect(() => 42);

// Async cleanups cannot participate in synchronous teardown ordering and their
// rejected promises would otherwise escape the lifecycle error boundary.
// @ts-expect-error — a cleanup must finish synchronously.
useEffect(() => async () => {});

type LinkedUser = { id: string; name: string };
const linkedOptions: LinkedStateOptions<LinkedUser, string> = {
	sourceEqual: (previous, next) => previous.id === next.id,
	valueEqual: (previous, next) => previous === next,
};
const linkedUser: LinkedUser = { id: 'user-1', name: 'Sam' };
const [linkedDraft, setLinkedDraft, getLinkedDraft] = useLinkedState(
	linkedUser,
	(source, previous) => {
		const previousDraft: LinkedStatePrevious<LinkedUser, string> | undefined = previous;
		return previousDraft?.value ?? source.name;
	},
	linkedOptions,
);

const currentLinkedDraft: string = linkedDraft;
const latestLinkedDraft: string = getLinkedDraft();
setLinkedDraft('Updated');
setLinkedDraft((previous) => previous.toUpperCase());

// @ts-expect-error — updates must match the value returned by the reconciler.
setLinkedDraft(123);

useLinkedState(linkedUser, (source) => source.name, {
	// @ts-expect-error — equality functions return a boolean.
	sourceEqual: () => 'equal',
});

// Declaring `previous` must not hide the reconciler's return type when nothing
// else names the value type.
type LinkedKey = { key: string };
const [linkedChanged, setLinkedChanged] = useLinkedState(
	{ key: 'sample' } as LinkedKey,
	(source, previous) => previous !== undefined && source.key !== previous.source.key,
	{ sourceEqual: (previous, next) => previous.key === next.key },
);
setLinkedChanged(false);
// @ts-expect-error — the linked value is the reconciler's boolean.
setLinkedChanged('changed');
const [serverChanged] = useServerLinkedState(
	{ key: 'sample' } as LinkedKey,
	(source, previous) => previous !== undefined && source.key !== previous.source.key,
);
const [universalChanged] = useUniversalLinkedState(
	{ key: 'sample' } as LinkedKey,
	(source, previous) => previous !== undefined && source.key !== previous.source.key,
);
const linkedChangedFlags: boolean[] = [linkedChanged, serverChanged, universalChanged];

// An annotated return type types `previous.value` before the body is checked.
const [linkedCount] = useLinkedState(linkedUser, (_source, previous): number =>
	previous === undefined ? 0 : previous.value + 1,
);
const linkedCountValue: number = linkedCount;

// An annotated `previous` declares the linked value, even when the reconciler
// returns a narrower type.
type LinkedItem = { id: string };
const [linkedSelection, setLinkedSelection] = useLinkedState(
	linkedUser.id,
	(_id, _previous: LinkedStatePrevious<string, LinkedItem | null> | undefined) => null,
);
setLinkedSelection({ id: 'item-1' });
const linkedSelectionValue: LinkedItem | null = linkedSelection;

useLinkedState(
	linkedUser,
	// @ts-expect-error — the reconciler's return must fit `previous.value`.
	(source, previous: LinkedStatePrevious<LinkedUser, string> | undefined) =>
		previous === undefined ? source.name.length : 0,
);
// @ts-expect-error — the reconciler's return must fit `previous.value`.
useLinkedState<LinkedUser, string, number>(linkedUser, (source) => source.name);

const [serverDraft] = useServerLinkedState(linkedUser, (source) => source.name);
const [universalDraft] = useUniversalLinkedState(linkedUser, (source) => source.name);
const compatibleDrafts: string[] = [
	serverDraft,
	universalDraft,
	currentLinkedDraft,
	latestLinkedDraft,
];
