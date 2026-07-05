import { useEffect, useLayoutEffect, useInsertionEffect } from 'octane';

// Fixtures for conformance/insertion-effect-order.test.ts — ports of the
// useInsertionEffect ordering tests in facebook/react
// ReactHooksWithNoopRenderer-test.js:2566-2905 (React 19.2.7).

// Per ReactHooksWithNoopRenderer-test.js:2626 — one component with an
// insertion + layout + passive effect, all threading a shared committed value
// (`props.shared.text`): the insertion effect writes it, so the ordering is
// observable in what each later effect reads.
export function InsertionValueThreading(props) @{
	useInsertionEffect(() => {
		props.log('Create insertion [current: ' + props.shared.text + ']');
		props.shared.text = String(props.count);
		return () => props.log('Destroy insertion [current: ' + props.shared.text + ']');
	}, [props.count]);
	useLayoutEffect(() => {
		props.log('Create layout [current: ' + props.shared.text + ']');
		return () => props.log('Destroy layout [current: ' + props.shared.text + ']');
	}, [props.count]);
	useEffect(() => {
		props.log('Create passive [current: ' + props.shared.text + ']');
		return () => props.log('Destroy passive [current: ' + props.shared.text + ']');
	}, [props.count]);
	<span id="host">{'x'}</span>
}

// Per ReactHooksWithNoopRenderer-test.js:2741 — TWO insertion + TWO layout
// effects per component, two sibling components. `props.read()` renders the
// current committed [A: …, B: …] snapshot; `props.write()` commits this
// component's count — making the cross-component interleaving observable.
function InterleavedCounter(props) @{
	useInsertionEffect(() => {
		props.log('Create Insertion 1 for Component ' + props.name + ' ' + props.read());
		props.write(String(props.count));
		return () => props.log('Destroy Insertion 1 for Component ' + props.name + ' ' + props.read());
	}, [props.count]);
	useInsertionEffect(() => {
		props.log('Create Insertion 2 for Component ' + props.name + ' ' + props.read());
		props.write(String(props.count));
		return () => props.log('Destroy Insertion 2 for Component ' + props.name + ' ' + props.read());
	}, [props.count]);
	useLayoutEffect(() => {
		props.log('Create Layout 1 for Component ' + props.name + ' ' + props.read());
		return () => props.log('Destroy Layout 1 for Component ' + props.name + ' ' + props.read());
	}, [props.count]);
	useLayoutEffect(() => {
		props.log('Create Layout 2 for Component ' + props.name + ' ' + props.read());
		return () => props.log('Destroy Layout 2 for Component ' + props.name + ' ' + props.read());
	}, [props.count]);
	<span>
		{props.name as string}
	</span>
}

export function InterleavedPair(props) @{
	<div>
		<InterleavedCounter
			name="A"
			count={props.count}
			read={props.read}
			write={props.writeA}
			log={props.log}
		/>
		<InterleavedCounter
			name="B"
			count={props.count}
			read={props.read}
			write={props.writeB}
			log={props.log}
		/>
	</div>
}
