import {
	type LinkedStateOptions,
	type LinkedStatePrevious,
	useEffect,
	useLinkedState,
} from 'octane';
import { useLinkedState as useServerLinkedState } from 'octane/server';
import { useLinkedState as useUniversalLinkedState } from 'octane/universal';

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

const [serverDraft] = useServerLinkedState(linkedUser, (source) => source.name);
const [universalDraft] = useUniversalLinkedState(linkedUser, (source) => source.name);
const compatibleDrafts: string[] = [
	serverDraft,
	universalDraft,
	currentLinkedDraft,
	latestLinkedDraft,
];
