'use strong';

export function StrongOwnerButton(props: { invoke: () => void }) @{
	<button onClick={props.invoke}>read</button>
}
