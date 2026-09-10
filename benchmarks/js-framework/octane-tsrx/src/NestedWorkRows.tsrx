import type { OctaneNode } from 'octane';

// All modes enter the same compiled child hole. Only the supplied array shape
// determines whether its implicit descriptor keys have a wrapper path.
export function NestedWorkRows(props: { id: string; rows: OctaneNode[]; version: number }) @{
	<ul id={props.id} data-version={props.version}>{props.rows}</ul>
}
