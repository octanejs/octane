/** @jsxImportSource octane */

export function BoundEventArguments(props: {
	value: string;
	onCall: (...args: unknown[]) => void;
}) {
	const onCall = props.onCall;

	return (
		<>
			<button id="bound-none" onClick={() => onCall()}>
				none
			</button>
			<button id="bound-one" onClick={() => onCall(props.value)}>
				one
			</button>
			<button id="bound-two" onClick={() => onCall(props.value, 'second')}>
				two
			</button>
			<button id="bound-three" onClick={() => onCall(props.value, 'second', 'third')}>
				three
			</button>
			<button id="direct-native" onClick={onCall}>
				native
			</button>
		</>
	);
}
