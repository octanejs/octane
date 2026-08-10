import {
	type inferParserType,
	createLoader,
	createSerializer,
	parseAsInteger,
	parseAsString,
	useQueryState,
	useQueryStates,
} from '@octanejs/nuqs';

type IsAny<T> = 0 extends 1 & T ? true : false;
type Equal<Left, Right> =
	(<T>() => T extends Left ? 1 : 2) extends <T>() => T extends Right ? 1 : 2 ? true : false;
type Assert<T extends true> = T;

const integer = parseAsInteger.withDefault(0);
type Integer = inferParserType<typeof integer>;
type _IntegerExact = Assert<Equal<Integer, number>>;
type _IntegerNotAny = Assert<Equal<IsAny<Integer>, false>>;
type _IntegerRejectsString = Assert<Equal<Equal<Integer, string>, false>>;

const [count, setCount] = useQueryState('count', integer);
type _CountExact = Assert<Equal<typeof count, number>>;
type _CountNotAny = Assert<Equal<IsAny<typeof count>, false>>;
type _SetCountExact = Assert<Equal<ReturnType<typeof setCount>, Promise<URLSearchParams>>>;
type _SetCountRejectsVoid = Assert<Equal<Equal<ReturnType<typeof setCount>, void>, false>>;

const [filters, setFilters] = useQueryStates({
	q: parseAsString.withDefault(''),
	page: integer,
});
type Filters = typeof filters;
type _FiltersExact = Assert<Equal<Filters, { q: string; page: number }>>;
type _FiltersNotAny = Assert<Equal<IsAny<Filters>, false>>;
type _FiltersRejectsPartial = Assert<Equal<Equal<Filters, { q: string }>, false>>;
type _SetFiltersExact = Assert<Equal<ReturnType<typeof setFilters>, Promise<URLSearchParams>>>;

const load = createLoader({ q: parseAsString, page: parseAsInteger });
const loaded = load('?q=x&page=2');
type Loaded = typeof loaded;
type _LoadedExact = Assert<Equal<Loaded, { q: string | null; page: number | null }>>;
type _LoadedNotAny = Assert<Equal<IsAny<Loaded>, false>>;
type _LoadedRejectsRequired = Assert<Equal<Equal<Loaded, { q: string; page: number }>, false>>;

const serialize = createSerializer({ q: parseAsString, page: parseAsInteger });
const serialized = serialize({ q: 'x', page: 2 });
type Serialized = typeof serialized;
type _SerializedExact = Assert<Equal<Serialized, string>>;
type _SerializedNotAny = Assert<Equal<IsAny<Serialized>, false>>;
type _SerializedRejectsParams = Assert<Equal<Equal<Serialized, URLSearchParams>, false>>;

// Accept/reject value probes: exact types must accept their contract values
// and reject mismatched shapes without collapsing through `any`.
const _acceptInteger: Integer = 0;
const _acceptCount: typeof count = 1;
const _acceptFilters: Filters = { q: 'octane', page: 2 };
const _acceptLoaded: Loaded = { q: 'x', page: 2 };
const _acceptSerialized: Serialized = '?q=x&page=2';

// @ts-expect-error Integer is exactly number, not string
const _rejectInteger: Integer = '0';
// @ts-expect-error count state is number, not null
const _rejectCount: typeof count = null;
// @ts-expect-error filters require both q and page
const _rejectFilters: Filters = { q: 'octane' };
// @ts-expect-error loader nullable fields are not required strings
const _rejectLoaded: Loaded = { q: 'x', page: '2' };
// @ts-expect-error serializer returns string, not URLSearchParams
const _rejectSerialized: Serialized = new URLSearchParams('q=x');
