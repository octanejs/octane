'use strong';

export interface StrongTableSnapshotProps {
	variant: 'inline' | 'for' | 'extracted';
	rowId: string;
	label: string;
	selected: boolean;
	sortDirection: 'none' | 'asc' | 'desc';
}

// This component receives only immutable values. The compatibility consumer
// owns the live table subscription and crosses this boundary with snapshots.
export function StrongTableSnapshot(props: StrongTableSnapshotProps) @{
	<li
		class={'strong-table-snapshot strong-table-' + props.variant}
		data-row={props.rowId}
		data-selected={props.selected ? '1' : '0'}
		data-sort={props.sortDirection}
	>
		{props.label + ':' + (props.selected ? 'selected' : 'clear') + ':' + props.sortDirection}
	</li>
}
