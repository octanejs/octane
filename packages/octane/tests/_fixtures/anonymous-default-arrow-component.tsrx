import { useState } from 'octane';

// An authored binding with Babel's conventional anonymous-default name: the
// binding the compiler synthesizes for the arrow component below must not collide.
const _default = 'clicks';

export default (props: { label: string }) => @{
	const [count, setCount] = useState(0);
	<button
		class="counter"
		onClick={() => setCount(count + 1)}
	>{`${props.label} ${_default} ${count}`}</button>
};
