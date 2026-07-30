// Mixed-arm ternaries written INLINE in a sole-child hole: one arm a keyed
// array, the other a component. A statically JSX-armed ternary lowers to an
// @if-style block whose branch hosts the keyed list, not a value hole (the
// setup-assigned value-hole variants live in hole-kind-flip.tsrx).

import { useState } from 'octane';

function Chip() @{
	<em>{'chip'}</em>
}

export function MapArm() @{
	const [mode, setMode] = useState(0);
	<div>
		<button class="next" onClick={() => setMode(mode + 1)}>{'next'}</button>
		<div class="host">
			{mode % 2 === 0 ? ['x', 'y'].map((id) => <i key={id}>{id as string}</i>) : <Chip />}
		</div>
	</div>
}

// The same shape written as directives: identical branch-slot + keyed-list
// runtime path, with the keyed list as the branch's sole root.
export function ForArm() @{
	const [mode, setMode] = useState(0);
	<div>
		<button class="next" onClick={() => setMode(mode + 1)}>{'next'}</button>
		<div class="host">
			@if (mode % 2 === 0) {
				@for (const id of ['x', 'y']; key id) {
					<i>{id as string}</i>
				}
			} @else {
				<Chip />
			}
		</div>
	</div>
}
