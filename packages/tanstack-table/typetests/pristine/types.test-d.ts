// Pristine side: published @tanstack/react-table@9.0.0-beta.58 typings, compiled
// with plain tsc. Assertion groups are listed in ../assertions.md and must stay
// one-for-one with ../adapted/types.test-d.ts.
import type { TableState } from '@tanstack/table-core';
import {
	createColumnHelper,
	createTableHookContexts,
	flexRender,
	tableFeatures,
	useTable,
} from '@tanstack/react-table';

type Equal<Left, Right> =
	(<Value>() => Value extends Left ? 1 : 2) extends <Value>() => Value extends Right ? 1 : 2
		? true
		: false;
type Expect<Value extends true> = Value;
type IsErasedAny<T> = 0 extends 1 & T ? true : false;

type Person = { name: string; age: number };

// 1. useTable accepts features, data, and columns and returns a typed table.
const features = tableFeatures({});
const columns = [{ accessorKey: 'name' as const, header: 'Name' }];
const table = useTable({ features, data: [{ name: 'Ada', age: 36 }], columns });
const firstOriginal = table.getRowModel().rows[0].original;
type _FirstOriginal = Expect<Equal<typeof firstOriginal, Person>>;

// 2. A selector overload preserves TableState inference.
const selected = useTable(
	{ features, data: [{ name: 'Ada', age: 36 }], columns },
	function (state) {
		return state;
	},
);
type _SelectedState = Expect<Equal<typeof selected.state, Readonly<TableState<typeof features>>>>;

// 3. createColumnHelper is a callable helper factory.
const helper = createColumnHelper<typeof features, Person>();
const nameColumn = helper.accessor('name', {
	header: 'Name',
	cell: function (info) {
		const value = info.getValue();
		type _NameValue = Expect<Equal<typeof value, string>>;
		return value;
	},
});
void nameColumn;

// 4. flexRender is a callable render helper.
function Label(props: { text: string }) {
	return props.text;
}
const rendered = flexRender(Label, { text: 'x' });
type _RenderedNotAny = Expect<Equal<IsErasedAny<typeof rendered>, false>>;

// 5. createTableHookContexts exposes useTableContext.
const contexts = createTableHookContexts<typeof features>();
const tableFromContext = contexts.useTableContext();
type _ContextTableState = Expect<
	Equal<typeof tableFromContext.state, Readonly<TableState<typeof features>>>
>;

// 6. useTable rejects an unknown option key.
useTable({
	features,
	data: [{ name: 'Ada', age: 36 }],
	columns,
	// @ts-expect-error unknown option
	notATableOption: true,
});
