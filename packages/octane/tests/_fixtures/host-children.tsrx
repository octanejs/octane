import { useState } from 'octane';
import { HostWrap } from './host-wrap';

function Counter(props) @{
	const [n, setN] = useState(0);
	props.bind(() => setN(n + 1));
	<span class="count">{n as string}</span>
}

export function HostChildrenApp(props) @{
	const [tick, setTick] = useState(0);
	props.bindParent(() => setTick(tick + 1));
	<HostWrap>
		<span class="tick">{tick as string}</span>
		<Counter bind={props.bind} />
	</HostWrap>
}
