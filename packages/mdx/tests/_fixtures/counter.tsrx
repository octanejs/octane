import { useState } from 'octane';

// A stateful octane component embedded in MDX documents (imported inside
// `.mdx` via `import Counter from './counter.tsrx'`) — proves an MDX document
// composes with real compiled octane components, delegated events included.
export default function Counter(props) @{
	const [count, setCount] = useState(props.start ?? 0);
	<button data-testid="counter" onClick={() => setCount(count + 1)}>{'count: ' + count}</button>
}
