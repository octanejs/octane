import { useState } from 'octane';

function Para() @{
	const [v] = useState('p');
	<p>{v as string}</p>
}

function Other() @{
	const [v] = useState('o');
	<p>{v as string}</p>
}

function Leaf() @{
	const [v] = useState('l');
	<b>{v as string}</b>
}

let leaf = false;

// Each arm renders one root, so this is a single-root component too. Once
// its branch renders the component arm, the branch moves this component's
// boundary onto a comment pair of its own.
function Flip() @{
	@if (leaf) {
		<Leaf />
	} @else {
		<p>{'f' as string}</p>
	}
}

// A cross-module call to `Callee` renders whichever component this live
// binding holds when its caller renders.
export let Callee = Para;

export function selectCallee(other: boolean) {
	Callee = other ? Other : Para;
}

export function selectFlip(showLeaf: boolean) {
	Callee = Flip;
	leaf = showLeaf;
}
