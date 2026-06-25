// A `@{}` with no output node (no trailing TSRX fragment) returns `undefined` and
// renders nothing — its setup still runs. "No output" is valid, not an error.
export function NoOutput(props) @{
	props.onSetup();
}

export function NoOutputHost(props) @{
	<div>
		<NoOutput onSetup={props.onSetup} />
		{'tail' as string}
	</div>
}
