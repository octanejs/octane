import { useEffect, useState } from 'octane';

// A stateful Octane component: `label`/`start` come from React through the
// wrapper; `count` is Octane-local state that must survive React prop updates.
export function Counter(props) @{
	const [count, setCount] = useState(props.start ?? 0);
	<div class="counter">
		<span class="label">
			{props.label as string}
		</span>
		<button class="inc" onClick={() => setCount(count + 1)}>
			{'Count: ' + count}
		</button>
	</div>
}

// Renders bridged React children through the `{children}` hole.
export function Panel(props) @{
	<section class="panel">
		<h2 class="title">
			{props.title as string}
		</h2>
		<div class="body">{props.children}</div>
	</section>
}

// Reports mount/cleanup so tests can assert the wrapper tears Octane down.
export function Effectful(props) @{
	useEffect(() => {
		props.onLog('mount');
		return () => props.onLog('cleanup');
	}, []);
	<p class="effectful">{'effect host'}</p>
}
