import Dexie, {
	type DexieYProvider,
	type PermissionChecker,
	useDocument,
	useLiveQuery,
	useObservable,
	usePermissions,
	useSuspendingLiveQuery,
	useSuspendingObservable,
	type Subscribable,
} from '@octanejs/dexie';

declare function expectType<T>(value: T): void;

type Item = { id: number; name: string };
type Doc = { id: string };

declare const db: Dexie;
declare const doc: Doc;
declare const observable: {
	subscribe(next: (value: Item[]) => void): () => void;
};

const observed = useObservable(observable);
expectType<Item[] | undefined>(observed);

const observedWithDefault = useObservable(observable, []);
expectType<Item[]>(observedWithDefault);

const queried = useLiveQuery(() => db.table<Item>('items').toArray(), [db], []);
expectType<Item[]>(queried);

const suspended = useSuspendingLiveQuery(() => db.table<Item>('items').toArray(), ['items']);
expectType<Item[]>(suspended);

declare const observerSource: Subscribable<Item[]>;
const observerKey = ['observer'] as const;
const suspendedObservable = useSuspendingObservable(observerSource, observerKey);
expectType<Item[]>(suspendedObservable);
expectType<Item[]>(useSuspendingObservable(() => observerSource, observerKey));
expectType<Item[]>(useSuspendingObservable(observerSource, observerKey, Symbol('observer')));
expectType<Item[]>(useSuspendingObservable(() => observerSource, observerKey, undefined));

// @ts-expect-error The inferred result retains the observable's value type.
expectType<string>(suspendedObservable);

// @ts-expect-error Suspending observables subscribe with an observer object.
useSuspendingObservable(observable, ['callback']);
// @ts-expect-error Factories must return an observer-style source too.
useSuspendingObservable(() => observable, ['callback']);
// @ts-expect-error Explicit slots preserve the same subscription contract.
useSuspendingObservable(observable, ['callback'], Symbol('callback'));

const permissions = usePermissions(db, 'items', doc);
expectType<PermissionChecker<Doc, string>>(permissions);
expectType<boolean>(permissions.add('items'));

const provider = useDocument(doc);
expectType<DexieYProvider<Doc> | null>(provider);

const defaultDexie: Dexie = new Dexie('type-test');
expectType<typeof Dexie>(Dexie);
expectType<Dexie>(defaultDexie);
