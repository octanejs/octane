import { useId, useState } from 'octane';

export function App(props: { initialName: string }) @{
	const nameId = useId();
	const [name, setName] = useState(props.initialName);
	const [submitted, setSubmitted] = useState(0);
	const greeting = name.trim() || 'guest';

	<section aria-label="Signup">
		<label htmlFor={nameId}>Name</label>
		<input
			id={nameId}
			value={name}
			onInput={(event) => setName((event.target as HTMLInputElement).value)}
		/>
		<h1 id="greeting">{'Welcome, ' + greeting}</h1>
		<button id="submit-count" type="button" onClick={() => setSubmitted((count) => count + 1)}>
			{'Submitted: ' + submitted}
		</button>
	</section>
}
