import { useState } from 'octane';

// return-JSX form: a host element containing `@if` — folds to the return-based
// fragment model (the branch helpers stay in the component for their closure; the
// condition + helpers thread into the renderer as `props.hN` holes).
export function RetToggle(props) {
	const [n, setN] = useState(0);
	return <div>
		@if (props.on) {
			<button id="hit" onClick={() => setN(n + 1)}>
				{'on:' + n}
			</button>
		} @else {
			<span class="off">off</span>
		}
	</div>;
}

// `@{}` oracle — the inline form. Must produce byte-identical DOM to the folded
// return-JSX form above (and update identically), which is the fold's contract.
export function AtToggle(props) @{
	const [n, setN] = useState(0);
	<div>
		@if (props.on) {
			<button id="hit" onClick={() => setN(n + 1)}>
				{'on:' + n}
			</button>
		} @else {
			<span class="off">off</span>
		}
	</div>
}
