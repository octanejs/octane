import {
	ZeroProvider,
	useConnectionState,
	useQuery,
	useSuspenseQuery,
	useZero,
	useZeroOnline,
} from '@octanejs/zero';
import type { Query, Schema, Zero, ZeroOptions } from '@rocicorp/zero';

type Props = {
	zero: Zero<Schema>;
};

function BindingValues() @{
	const zero = useZero<Schema>();
	const connection = useConnectionState();
	const online = useZeroOnline();

	<output id="binding-values">
		{zero.clientID + '/' + connection.name + '/' + String(online)}
	</output>
}

export function ExternalZeroBinding(props: Props) @{
	<ZeroProvider zero={props.zero}>
		<BindingValues />
	</ZeroProvider>
}

export function MissingZeroProvider() @{
	const zero = useZero<Schema>();
	<output>{zero.clientID}</output>
}

type ConstructedProps =
	ZeroOptions<Schema> & {
		init?: (zero: Zero<Schema>) => void;
	};

export function ConstructedZeroBinding(props: ConstructedProps) @{
	<ZeroProvider {...props}>
		<BindingValues />
	</ZeroProvider>
}

type Row = { id: string; name: string };

type QueryProps = {
	zero: Zero<Schema>;
	query: Query<string, Schema, readonly Row[]>;
};

function QueryValues(props: { query: Query<string, Schema, readonly Row[]> }) @{
	const [rows, details] = useQuery(props.query);
	<output id="query-values">{rows.length + '/' + details.type}</output>
}

export function QueryBinding(props: QueryProps) @{
	<ZeroProvider zero={props.zero}>
		<QueryValues query={props.query} />
	</ZeroProvider>
}

function SuspenseQueryValues(props: { query: Query<string, Schema, readonly Row[]> }) @{
	const [rows, details] = useSuspenseQuery(props.query, { suspendUntil: 'complete' });
	<output id="suspense-query-values">{rows.length + '/' + details.type}</output>
}

function PartialSuspenseQueryValues(props: { query: Query<string, Schema, readonly Row[]> }) @{
	const [rows, details] = useSuspenseQuery(props.query);
	<output id="partial-suspense-query-values">{rows.length + '/' + details.type}</output>
}

function SuspenseQueryBoundary(props: { query: Query<string, Schema, readonly Row[]> }) @{
	@try {
		<SuspenseQueryValues query={props.query} />
	} @pending {
		<output id="suspense-query-pending">pending</output>
	} @catch (error) {
		<output id="suspense-query-error">{String(error)}</output>
	}
}

export function SuspenseQueryBinding(props: QueryProps) @{
	<ZeroProvider zero={props.zero}>
		<SuspenseQueryBoundary query={props.query} />
	</ZeroProvider>
}

function PartialSuspenseQueryBoundary(props: { query: Query<string, Schema, readonly Row[]> }) @{
	@try {
		<PartialSuspenseQueryValues query={props.query} />
	} @pending {
		<output id="partial-suspense-query-pending">pending</output>
	} @catch (error) {
		<output id="partial-suspense-query-error">{String(error)}</output>
	}
}

export function PartialSuspenseQueryBinding(props: QueryProps) @{
	<ZeroProvider zero={props.zero}>
		<PartialSuspenseQueryBoundary query={props.query} />
	</ZeroProvider>
}

function SequentialSuspenseQueryValues(props: {
	queryA: Query<string, Schema, readonly Row[]>;
	queryB: Query<string, Schema, readonly Row[]>;
}) @{
	const [rowsA, detailsA] = useSuspenseQuery(props.queryA, { suspendUntil: 'complete' });
	const [rowsB, detailsB] = useSuspenseQuery(props.queryB, { suspendUntil: 'complete' });
	<output id="sequential-suspense-query-values">
		{rowsA.length + '/' + detailsA.type + '/' + rowsB.length + '/' + detailsB.type}
	</output>
}

export function SequentialSuspenseQueryBinding(props: {
	zero: Zero<Schema>;
	queryA: Query<string, Schema, readonly Row[]>;
	queryB: Query<string, Schema, readonly Row[]>;
}) @{
	<ZeroProvider zero={props.zero}>
		@try {
			<SequentialSuspenseQueryValues queryA={props.queryA} queryB={props.queryB} />
		} @pending {
			<output id="sequential-suspense-query-pending">pending</output>
		} @catch (error) {
			<output id="sequential-suspense-query-error">{String(error)}</output>
		}
	</ZeroProvider>
}
