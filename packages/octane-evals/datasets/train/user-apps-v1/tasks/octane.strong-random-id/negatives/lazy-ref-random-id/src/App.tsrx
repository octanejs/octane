'use strong';
// Workaround: create the random ID once with useLazyRef.
import { useLazyRef, useState } from 'octane';

export function App() @{
	const [email, setEmail] = useState('');
	const id = useLazyRef(() => `email-${crypto.randomUUID()}`).current;

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
