interface CompilerNameCollisionProps {
	first: number;
	second: number;
	third: number;
	fourth: number;
	fifth: number;
	sixth: number;
	onSelect: () => void;
}

function CollisionTotal(props: { value: number }) @{
	<span id="compiler-name-collision-total">{props.value as string}</span>
}

export function CompilerNameCollisionApp(props: CompilerNameCollisionProps) @{
	const __memoCache = props.first;
	const __memoCache$1 = props.second;
	const __memoCache$2 = props.third;
	const __memoCommitted = props.fourth;
	const __memoCommitted$1 = props.fifth;
	const __memoCommitted$2 = props.sixth;
	const total =
		__memoCache + __memoCache$1 + __memoCache$2 + __memoCommitted + __memoCommitted$1 +
		__memoCommitted$2;

	<button id="compiler-name-collision" onClick={props.onSelect}>
		<CollisionTotal value={total} />
	</button>
}
