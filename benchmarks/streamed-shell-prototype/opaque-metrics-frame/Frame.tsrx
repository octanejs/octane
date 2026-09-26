import type { OctaneNode } from 'octane';
import { unbound } from 'octane/behavior';

export type Row = { id: string; text: string };
export type FrameProps = { rows: Row[]; children: OctaneNode };

export function Frame(props: FrameProps) @{
	'use dom bindings';
	<section id="frame">
		<ul>
			@for (const row of props.rows; key row.id) {
				<li data-row={row.id}>{row.text as string}</li>
			}
		</ul>
		<div id="stream-slot">{unbound(props.children)}</div>
	</section>
}
