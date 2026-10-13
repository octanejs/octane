import { useState } from 'octane';

// A route the shell loads lazily inside a navigation transition.
export default function Settings() @{
	const [name, setName] = useState('guest');
	<form id="shell-settings" onSubmit={(event) => event.preventDefault()}>
		<input
			id="shell-settings-name"
			value={name}
			onInput={(event) => setName((event.currentTarget as HTMLInputElement).value)}
		/>
		<output>{name as string}</output>
	</form>
}
