import type { Queryable, Store } from '@livestore/livestore';
import { useQueryRef } from '@octanejs/livestore';

export function QueryReader(props: {
	store: Store<any>;
	queryable: Queryable<any>;
	label: string;
	onRender?: () => void;
	onQuery?: (query: object) => void;
}) @{
	props.onRender?.();
	const result = useQueryRef(props.queryable, { store: props.store });
	props.onQuery?.(result.queryRcRef.value);
	<div class="query" data-label={props.label}>{JSON.stringify(result.valueRef.current)}</div>
}

export function TwoQueryReaders(props: {
	store: Store<any>;
	queryable: Queryable<any>;
	showSecond: boolean;
	onQuery?: (query: object) => void;
}) @{
	<div>
		<QueryReader
			store={props.store}
			queryable={props.queryable}
			label="first"
			onQuery={props.onQuery}
		/>
		@if (props.showSecond) {
			<QueryReader
				store={props.store}
				queryable={props.queryable}
				label="second"
				onQuery={props.onQuery}
			/>
		}
	</div>
}
