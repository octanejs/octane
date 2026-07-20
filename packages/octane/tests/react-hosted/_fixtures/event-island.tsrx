/**
 * Island content for the §8 native-event-propagation spike. The handlers are
 * ordinary delegated Octane events attached at the island host; the test wraps
 * the host in React `onClickCapture`/`onClick` ancestors and asserts the native
 * capture → target → bubble interleaving plus stopPropagation from each position.
 */
export function EventIsland(props) @{
	<div
		class="octane-outer"
		onClickCapture={(event) => {
			props.log('octane-capture');
			if (props.stopAt === 'octane-capture') event.stopPropagation();
		}}
		onClick={() => props.log('octane-bubble-outer')}
	>
		<button
			class="octane-target"
			onClick={(event) => {
				props.log('octane-bubble-target');
				if (props.stopAt === 'octane-bubble-target') event.stopPropagation();
			}}
		>{'go'}</button>
	</div>
}

export function CounterEventIsland(props) @{
	<button class="evt-count" onClick={() => props.onIncrement()}>{'count:' + props.count}</button>
}
