import type { RowQuery } from '@livestore/common';
import { SessionIdSymbol } from '@livestore/common';
import { State } from '@livestore/common/schema';
import {
	removeUndefinedValues,
	type StateSetters,
	validateTableOptions,
} from '@livestore/framework-toolkit';
import type { LiveQuery, LiveQueryDef, Store } from '@livestore/livestore';
import { queryDb } from '@livestore/livestore';
import { omitUndefineds, shouldNeverHappen } from '@livestore/utils';
import { useMemo } from 'octane';
import { splitSlot, subSlot } from './internal';
import { useQueryRef } from './useQuery';

export type UseClientDocumentResult<
	TTableDef extends State.SQLite.ClientDocumentTableDef.TraitAny,
> = [
	row: TTableDef['Value'],
	setRow: StateSetters<TTableDef>,
	id: string,
	query$: LiveQuery<TTableDef['Value']>,
];

export function useClientDocument<
	TTableDef extends State.SQLite.ClientDocumentTableDef.Trait<
		any,
		any,
		any,
		{ partialSet: boolean; default: any }
	>,
>(
	table: TTableDef,
	id?: State.SQLite.ClientDocumentTableDef.DefaultIdType<TTableDef> | SessionIdSymbol,
	options?: Partial<RowQuery.GetOrCreateOptions<TTableDef>>,
): UseClientDocumentResult<TTableDef>;
export function useClientDocument<
	TTableDef extends State.SQLite.ClientDocumentTableDef.Trait<
		any,
		any,
		any,
		{ partialSet: boolean; default: any }
	>,
>(
	table: TTableDef,
	id: State.SQLite.ClientDocumentTableDef.DefaultIdType<TTableDef> | string | SessionIdSymbol,
	options?: Partial<RowQuery.GetOrCreateOptions<TTableDef>>,
): UseClientDocumentResult<TTableDef>;
export function useClientDocument<TTableDef extends State.SQLite.ClientDocumentTableDef.Any>(
	table: TTableDef,
	idOrOptions:
		string | SessionIdSymbol | Partial<RowQuery.GetOrCreateOptions<TTableDef>> | undefined,
	options: Partial<RowQuery.GetOrCreateOptions<TTableDef>> | undefined,
	storeArg: { store?: Store } | undefined,
	slot: symbol,
): UseClientDocumentResult<TTableDef>;
export function useClientDocument<TTableDef extends State.SQLite.ClientDocumentTableDef.Any>(
	table: TTableDef,
	...rest: [
		idOrOptions?: string | SessionIdSymbol | Partial<RowQuery.GetOrCreateOptions<TTableDef>>,
		options?: Partial<RowQuery.GetOrCreateOptions<TTableDef>>,
		storeArg?: { store?: Store },
		slot?: symbol,
	]
): UseClientDocumentResult<TTableDef> {
	const [args, slot] = splitSlot(rest, (value) => value === SessionIdSymbol);
	const idOrOptions = args[0] as
		string | SessionIdSymbol | Partial<RowQuery.GetOrCreateOptions<TTableDef>> | undefined;
	const optionsArgument = args[1] as Partial<RowQuery.GetOrCreateOptions<TTableDef>> | undefined;
	const storeArg = args[2] as { store?: Store } | undefined;
	const id =
		typeof idOrOptions === 'string' || idOrOptions === SessionIdSymbol
			? idOrOptions
			: table[State.SQLite.ClientDocumentTableDefSymbol].options.default.id;
	const options =
		typeof idOrOptions === 'string' || idOrOptions === SessionIdSymbol
			? optionsArgument
			: idOrOptions;
	const { default: defaultValues } = options ?? {};

	useMemo(() => validateTableOptions(table), [table], subSlot(slot, 'document:validate'));
	const tableName = table.sqliteDef.name;
	const store = storeArg?.store ?? shouldNeverHappen('No store provided to useClientDocument');
	const idStr: string = id === SessionIdSymbol ? store.sessionId : id;
	type QueryDef = LiveQueryDef<TTableDef['Value']>;
	const queryDef: QueryDef = useMemo(
		() =>
			queryDb(table.get(id, { default: defaultValues! }), {
				deps: [idStr, tableName, JSON.stringify(defaultValues)],
			}),
		[table, id, defaultValues, idStr],
		subSlot(slot, 'document:query'),
	);
	const queryRef = useQueryRef(
		queryDef,
		{
			otelSpanName: `LiveStore:useClientDocument:${tableName}:${idStr}`,
			...omitUndefineds({ store: storeArg?.store }),
		},
		subSlot(slot, 'document:query-ref'),
	);
	const setState = useMemo<StateSetters<TTableDef>>(
		() => (newValueOrFn: TTableDef['Value']) => {
			const newValue =
				typeof newValueOrFn === 'function' ? newValueOrFn(queryRef.valueRef.current) : newValueOrFn;
			if (queryRef.valueRef.current === newValue) return;
			store.commit(table.set(removeUndefinedValues(newValue), id));
		},
		[id, queryRef.valueRef, store, table],
		subSlot(slot, 'document:set'),
	);
	return [queryRef.valueRef.current, setState, idStr, queryRef.queryRcRef.value];
}
