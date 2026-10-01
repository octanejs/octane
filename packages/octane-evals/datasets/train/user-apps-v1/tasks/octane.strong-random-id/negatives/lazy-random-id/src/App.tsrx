'use strong';
// Workaround: generate the random ID once in a lazy state initializer.
import { useState } from 'octane';

export function App() @{
	const [email, setEmail] = useState('');
	const [id] = useState(() => `email-${crypto.randomUUID()}`);

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
