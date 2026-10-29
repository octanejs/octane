import { useSyncExternalStore as octaneUseSyncExternalStore } from 'octane';
import { useSyncExternalStore as mainUseSyncExternalStore } from '@octanejs/use-sync-external-store';
import { useSyncExternalStore as shimUseSyncExternalStore } from '@octanejs/use-sync-external-store/shim';
import { useSyncExternalStore as shimIndexUseSyncExternalStore } from '@octanejs/use-sync-external-store/shim/index.js';
import { useSyncExternalStore as nativeUseSyncExternalStore } from '@octanejs/use-sync-external-store/shim/index.native';
import { useSyncExternalStore as nativeJsUseSyncExternalStore } from '@octanejs/use-sync-external-store/shim/index.native.js';
import { useSyncExternalStoreWithSelector } from '@octanejs/use-sync-external-store/with-selector';
import { useSyncExternalStoreWithSelector as selectorJs } from '@octanejs/use-sync-external-store/with-selector.js';
import { useSyncExternalStoreWithSelector as shimSelector } from '@octanejs/use-sync-external-store/shim/with-selector';
import { useSyncExternalStoreWithSelector as shimSelectorJs } from '@octanejs/use-sync-external-store/shim/with-selector.js';
import type { Assert, Equal } from '../../../../scripts/react-port/type-assertions.js';

type BuiltIn = typeof octaneUseSyncExternalStore;
type MainShape = Assert<Equal<typeof mainUseSyncExternalStore, BuiltIn>>;
type ShimShape = Assert<Equal<typeof shimUseSyncExternalStore, BuiltIn>>;
type ShimIndexShape = Assert<Equal<typeof shimIndexUseSyncExternalStore, BuiltIn>>;
type NativeShape = Assert<Equal<typeof nativeUseSyncExternalStore, BuiltIn>>;
type NativeJsShape = Assert<Equal<typeof nativeJsUseSyncExternalStore, BuiltIn>>;

type WithSelector = <Snapshot, Selection>(
	subscribe: (onStoreChange: () => void) => () => void,
	getSnapshot: () => Snapshot,
	getServerSnapshot: undefined | null | (() => Snapshot),
	selector: (snapshot: Snapshot) => Selection,
	isEqual?: (a: Selection, b: Selection) => boolean,
) => Selection;
type SelectorShape = Assert<Equal<typeof useSyncExternalStoreWithSelector, WithSelector>>;
type SelectorJsShape = Assert<Equal<typeof selectorJs, WithSelector>>;
type ShimSelectorShape = Assert<Equal<typeof shimSelector, WithSelector>>;
type ShimSelectorJsShape = Assert<Equal<typeof shimSelectorJs, WithSelector>>;

const subscribe = (onStoreChange: () => void) => {
	onStoreChange();
	return () => {};
};
const snapshot = { count: 1, label: 'one' };
const count: number = shimUseSyncExternalStore(subscribe, () => snapshot.count);
const label = useSyncExternalStoreWithSelector(
	subscribe,
	() => snapshot,
	() => snapshot,
	(state) => state.label,
	(left, right) => left === right,
);
type SelectionShape = Assert<Equal<typeof label, string>>;

const getSnapshot = () => snapshot;
const selectNumber = (state: number) => state;
const selectCount = (state: typeof snapshot) => state.count;
const compareText = (a: string) => !a;
const getText = () => 'one';
// @ts-expect-error The selector receives the store snapshot.
useSyncExternalStoreWithSelector(subscribe, getSnapshot, null, selectNumber);
// @ts-expect-error isEqual compares two selections.
shimSelector(subscribe, getSnapshot, undefined, selectCount, compareText);
// @ts-expect-error The server snapshot must produce the store snapshot.
mainUseSyncExternalStore(subscribe, () => snapshot.count, getText);

export type {
	MainShape,
	ShimShape,
	ShimIndexShape,
	NativeShape,
	NativeJsShape,
	SelectorShape,
	SelectorJsShape,
	ShimSelectorShape,
	ShimSelectorJsShape,
	SelectionShape,
};
export { count };
