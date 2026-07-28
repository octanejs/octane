import { useState } from 'octane';

export interface BenchRow {
	id: number;
	label: string;
}

export interface BenchAppProps {
	rows: readonly BenchRow[];
}

/**
 * Row shape used by the Vue-Lynx unified benchmark matrix: a keyed list of
 * rows, each with an id cell, a tappable label cell, and a tappable remove
 * cell. The tap handlers are ordinary background `bind*` props so the suite
 * measures the same host-command volume a click-driven run would produce.
 */
export function BenchApp(props: BenchAppProps) @{
	const [selected, setSelected] = useState(0);
	const [removed, setRemoved] = useState(0);

	<view class="container">
		<view class="jumbotron">
			<text class="title">Octane Lynx</text>
			<text class="stats">{`selected=${selected} removed=${removed}`}</text>
		</view>
		<view class="table">
			@for (const row of props.rows; key row.id) {
				<view class={row.id === selected ? 'row danger' : 'row'} id={`row-${row.id}`}>
					<text class="col-id">{`${row.id}`}</text>
					<view class="col-label" bindtap={() => setSelected(row.id)}>
						<text>{row.label}</text>
					</view>
					<view class="col-remove" bindtap={() => setRemoved((count) => count + 1)}>
						<text>x</text>
					</view>
				</view>
			}
		</view>
	</view>
}

/** Empty-startup target: the same root and transport with no authored rows. */
export function EmptyApp() @{
	<view class="container" />
}
