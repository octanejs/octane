import Dexie, {
	type DexieYProvider,
	type PermissionChecker,
	useDocument,
	useLiveQuery,
	useObservable,
	usePermissions,
	useSuspendingLiveQuery,
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

const permissions = usePermissions(db, 'items', doc);
expectType<PermissionChecker<Doc, string>>(permissions);
expectType<boolean>(permissions.add('items'));

const provider = useDocument(doc);
expectType<DexieYProvider<Doc> | null>(provider);

const defaultDexie: Dexie = new Dexie('type-test');
expectType<typeof Dexie>(Dexie);
expectType<Dexie>(defaultDexie);
