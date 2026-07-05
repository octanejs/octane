import { useState } from 'octane';

// Regression fixtures for the commit-phase teardown ref detach
// (queueRefDetach). Compiled `ref` binding cleanups used to fire attachRef
// synchronously during unmountScope (mid-render); now they queue and drain at
// commit, before that commit's attaches.

// A state SETTER used as a ref, where the state decides WHICH element renders
// — both @if arms bind the same setter, so every flip tears one element down
// and mounts the other. With a synchronous unmount detach, setTarget(null)
// renders the @else arm before the @if arm's deferred attach fires, flipping
// forever. With the commit-phase detach, null + the replacement element land
// in the same batch and the component settles on arm "a".
export function SetterRefSwap(props) @{
	const [target, setTarget] = useState(null);
	props.observe(target);
	<div>
		@if (target) {
			<ol id="a" ref={setTarget} />
		} @else {
			<ol id="b" ref={setTarget} />
		}
	</div>
}

// A logging callback ref bound in both arms — pins the detach-before-attach
// order across an arm swap within one commit: [elB, null, elA].
export function LoggedRefSwap(props) @{
	<div>
		@if (props.on) {
			<p id="pa" ref={props.log} />
		} @else {
			<p id="pb" ref={props.log} />
		}
	</div>
}
