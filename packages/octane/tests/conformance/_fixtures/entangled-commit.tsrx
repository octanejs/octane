import { use, useState, useTransition, useLayoutEffect } from 'octane';

function SlowA(props) @{
	const v = use(props.p);
	useLayoutEffect((log) => log.push('A reveal'), [props.log]);
	<span class="a">{'A:' + v as string}</span>
}
function SlowB(props) @{
	const v = use(props.p);
	useLayoutEffect((log) => log.push('B reveal'), [props.log]);
	<span class="b">{'B:' + v as string}</span>
}

// Two independent boundaries; one startTransition swaps BOTH from their committed
// fast content to a suspending component (an off-screen if-block swap per boundary).
// React holds both prior screens until both resolve, then reveals together.
export function FanOut(props) @{
	const [swapped, setSwapped] = useState(false);
	const [isPending, start] = useTransition();
	<div>
		<span id="pending">
			{isPending ? '1' : '0'}
		</span>
		<button id="go" onClick={() => start(() => setSwapped(true))}>{'go'}</button>
		@try {
			@if (swapped) {
				<SlowA p={props.pa} log={props.log} />
			} @else {
				<span class="a">{'A:old'}</span>
			}
		} @pending {
			<span class="a-fb">{'A-fb'}</span>
		}
		@try {
			@if (swapped) {
				<SlowB p={props.pb} log={props.log} />
			} @else {
				<span class="b">{'B:old'}</span>
			}
		} @pending {
			<span class="b-fb">{'B-fb'}</span>
		}
	</div>
}
