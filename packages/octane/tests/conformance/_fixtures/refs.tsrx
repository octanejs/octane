import { useImperativeHandle, useState, useEffect } from 'octane';

// Fixtures for conformance/refs.test.ts — ported from facebook/react
// packages/react-dom/src/__tests__/refs-test.js (React 19.2.7).

// refs-test.js:19 'ref swapping' — three stable divs plus a single "hop" cursor
// ref that moves between them as `count` advances. The React original drives
// `count` from class state; here the test drives it via props — the divs are
// never rebuilt, only their ref bindings swap, exactly like the original.
export function RefHopsAround(props) @{
	<div ref={props.container}>
		<div class="first" ref={props.count % 3 === 0 ? props.hop : props.one} />
		<div class="second" ref={props.count % 3 === 1 ? props.hop : props.two} />
		<div class="third" ref={props.count % 3 === 2 ? props.hop : props.three} />
	</div>
}

// refs-test.js:176 'root level refs' — a lone host root; unmounting the root
// must cycle the callback ref to null.
export function HostRoot(props) @{
	<div id="root-host" ref={props.r} />
}

// refs-test.js:176 (multi-node root segment) — a fragment root whose ref'd div
// sits after a plain sibling. (The `<Comp ref>` class-instance segments are
// N/A — octane has no component instances.)
export function FragmentRoot(props) @{
	<>
		<span id="frag-span">{'x'}</span>
		<div id="frag-div" ref={props.r}>{'Hello'}</div>
	</>
}

// refs-test.js:273 'refs return clean up function' — one host element whose
// ref (and id) come from props; the tests swap them across renders the same
// way the React originals re-render with fresh inline arrows.
export function HostWithRef(props) @{
	<div id={props.id} ref={props.r} />
}

// refs-test.js:121 'ref called correctly for stateless component' — a STABLE
// callback ref threaded through a child component, with one post-mount parent
// re-render (the class original re-renders from componentDidMount). The ref
// must fire exactly once.
export function StableInner(props) @{
	<a ref={props.saveA} />
}
export function StableOuter(props) @{
	const [, setN] = useState(0);
	useEffect(() => {
		setN(1);
	}, []);
	<StableInner saveA={props.saveA} />
}

// refs-test.js:477 'useImerativeHandle refs' — the handle component (React 19
// passes ref as a prop; octane does the same, no forwardRef), plus a gate so
// tests can unmount it (the originals `root.render(null)`).
export function ImperativeHandle(props) {
	useImperativeHandle(
		props.ref,
		() => ({
			greet() {
				return 'Hello ' + props.name;
			},
		}),
		[props.name],
	);
	return null;
}
export function ImperativeGate(props) @{
	<div>
		@if (props.show) {
			<ImperativeHandle ref={props.r} name={props.name} />
		}
	</div>
}
