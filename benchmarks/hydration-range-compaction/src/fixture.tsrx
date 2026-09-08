import { useState } from 'octane';

interface WrapperProps {
	remaining: number;
}

function InteractiveLeaf() {
	const [count, setCount] = useState(0);
	return <button data-hydration-range-leaf="" onClick={() => setCount(count + 1)}>
		{'count:' + count}
	</button>;
}

function Wrapper(props: WrapperProps) {
	if (props.remaining === 0) return <InteractiveLeaf />;
	return <Wrapper remaining={props.remaining - 1} />;
}

export function DeepWrapperChain(props: { depth: number }) {
	return <Wrapper remaining={props.depth} />;
}
