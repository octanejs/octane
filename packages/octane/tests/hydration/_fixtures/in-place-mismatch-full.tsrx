import { useState } from 'octane';

let label = 'p';

// A hooked component renders through the full component slot.
function Para() @{
	const [v] = useState(label);
	<p>{v as string}</p>
}

// A production compile memoizes a call whose output reads only constants into
// the full component slot too.
function Constant() @{
	<p>{'c' as string}</p>
}

function Em() @{
	<em>{'e' as string}</em>
}

function Leaf() @{
	<b>{label as string}</b>
}

// Each client arm calls a component where the server's arm rendered a <u>,
// with no component range around it: the component's root is rebuilt over it.
export function Full(props: { on: boolean }) @{
	<div id="r">
		@if (props.on) {
			<section>
				<Em />
				<Para />
				<Leaf />
				<hr />
			</section>
		} @else {
			<section>
				<Em />
				<u>{'u' as string}</u>
				<Leaf />
				<hr />
			</section>
		}
	</div>
}

export function ConstantOutput(props: { on: boolean }) @{
	<div id="r">
		@if (props.on) {
			<section>
				<Em />
				<Constant />
				<Leaf />
				<hr />
			</section>
		} @else {
			<section>
				<Em />
				<u>{'u' as string}</u>
				<Leaf />
				<hr />
			</section>
		}
	</div>
}
