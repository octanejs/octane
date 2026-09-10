import type { OctaneNode } from 'octane';

// The descriptor array must cross a compiled child hole: a raw host descriptor's
// children use a different positional reconciler and never reach the scoped key helper.
export function UnkeyedRows(props: { rows: OctaneNode[]; version: number }) @{
	<ul id="unkeyed-work-rows" data-version={props.version}>{props.rows}</ul>
}
