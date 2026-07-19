import { useState } from 'octane';

export function App({ label = 'Count' }) @{
	const [count, setCount] = useState(0);
	const title = label?.trim() ?? 'Count';

	<view id="phase-one" bindtap={() => setCount((value) => value + 1)}>
		<text>{`${title}: ${count}`}</text>
	</view>
}

// Kept as an observable entry side effect so the production build must lower
// optional chaining/nullish coalescing to Rspeedy's ES2017 target.
globalThis.__octanePhaseOneTargetProbe = (value) => value?.nested?.label ?? 'octane-phase1-es2017';
