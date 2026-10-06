import { use } from 'octane';

function Reader(props: { value: Promise<string> }) @{
	<s>{use(props.value) as string}</s>
}

// A single-root component whose child suspends.
function Outer(props: { value: Promise<string> }) @{
	<i>
		<Reader value={props.value} />
	</i>
}

function StaticEm() @{
	<em>{'e'}</em>
}

// The arm's first child suspends inside its single root, and a static sibling
// follows it.
export function SuspendedSingleRoot(props: { s?: boolean; a: Promise<string> }) @{
	@try {
		@if (props.s) {
			<b>{'x'}</b>
		} @else {
			<>
				<Outer value={props.a} />
				<StaticEm />
			</>
		}
	} @pending {
		<p>{'pending'}</p>
	}
}
