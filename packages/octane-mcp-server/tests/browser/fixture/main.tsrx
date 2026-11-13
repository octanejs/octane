import { createRoot, useEffect, useState } from 'octane';

// One behavior per driver operation: a click (tap), an effect that copies the
// count after paint (clock), a text field (type) and a console line (logs).
function Greeting(props: { name: string }) @{
	const [shown] = useState('hello');
	<p data-testid="greeting">{`${shown} ${props.name}`}</p>
}

function App() @{
	const [count, setCount] = useState(0);
	const [seen, setSeen] = useState(0);
	const [name, setName] = useState('');
	useEffect(() => {
		setSeen(count);
	}, [count]);
	<main>
		<h1>{'Agent fixture'}</h1>
		<button data-testid="add" onClick={() => setCount(count + 1)}>{'Add one'}</button>
		<p data-testid="count">{`count ${count}`}</p>
		<p data-testid="seen">{`seen ${seen}`}</p>
		<input aria-label="Name" value={name} onInput={(event) => setName(event.currentTarget.value)} />
		<Greeting name={name} />
	</main>
}

console.info('fixture booted');
createRoot(document.getElementById('root')!).render(<App />);
