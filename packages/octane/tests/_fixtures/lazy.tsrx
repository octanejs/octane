import { useState } from 'octane';

// Inner components the tests wrap in lazy(). The test creates the lazy()
// wrapper itself (so each test gets a fresh payload) and passes it in as
// `props.comp`.
export function Greeting(props) @{
	<div class="loaded">{'hello ' + props.name}</div>
}

// Hook state inside a lazily-loaded component — used to prove the loaded
// component updates in place (no remount) across parent re-renders.
export function Counter(props) @{
	const [n, setN] = useState(0);
	<button class="counter" onClick={() => setN(n + 1)}>{'n:' + n + ' p:' + props.p}</button>
}

// Host that mounts whatever component the test passes, inside a boundary.
export function LazyHost(props) @{
	const C = props.comp;
	<>
		@try {
			<C name={props.name} />
		} @pending {
			<div class="fallback">{'loading'}</div>
		} @catch (err) {
			<div class="error">
				{'caught: ' + err.message as string}
			</div>
		}
	</>
}

// Parent state drives a prop through the lazy child so the test can assert the
// child UPDATES (hook state preserved) rather than remounting.
export function LazyUpdateHost(props) @{
	const C = props.comp;
	const [p, setP] = useState(0);
	<>
		<button id="bump" onClick={() => setP(p + 1)}>{'bump'}</button>
		@try {
			<C p={p} />
		} @pending {
			<div class="fallback">{'loading'}</div>
		}
	</>
}
