'use strong';
// Workaround: keep the random ID in a ref.
import { useRef, useState } from 'octane';

export function App() @{
	const [email, setEmail] = useState('');
	const id = useRef(`email-${crypto.randomUUID()}`).current;

	<form>
		<label for={id}>{'Email'}</label>
		<input
			id={id}
			type="email"
			value={email}
			onInput={(event) => setEmail(event.currentTarget.value)}
		/>
		<p>{(email ? `We will write to ${email}` : 'Enter your email') as string}</p>
	</form>
}
