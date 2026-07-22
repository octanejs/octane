import { useEffect, useLayoutEffect, useState } from 'octane';

function StatefulListItem(props) @{
	const [count, setCount] = useState(0);

	useLayoutEffect(() => {
		props.captureIncrement(props.id, () => setCount((value) => value + 1));
	}, [props.captureIncrement, props.id]);

	useEffect(() => {
		props.log('effect:' + props.id);
		return () => props.log('cleanup:' + props.id);
	}, [props.id, props.log]);

	<list-item item-key={props.id} reuse-identifier="stateful-row" defer>
		<text>{props.label + ': ' + count}</text>
	</list-item>
}

export function NativeListLifecycleFixture(props) @{
	<list id="stateful-feed">
		@for (const item of props.items; key item.id) {
			<StatefulListItem
				id={item.id}
				label={item.label}
				captureIncrement={props.captureIncrement}
				log={props.log}
			/>
		}
	</list>
}
