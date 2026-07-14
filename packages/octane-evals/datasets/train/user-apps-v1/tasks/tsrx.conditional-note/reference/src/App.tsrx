import { useState } from 'octane';

export interface AppProps {
	enabled: boolean;
	onSave: (note: string) => void;
}

export function App(props: AppProps) {
	if (!props.enabled) {
		return <main>
			<h1>{'Quick note'}</h1>
			<p role="status">{'Notes are disabled'}</p>
		</main>;
	}

	const [note, setNote] = useState('');
	const trimmed = note.trim();

	return <main>
		<h1>{'Quick note'}</h1>
		<label for="note">{'Note'}</label>
		<textarea
			id="note"
			maxLength={80}
			value={note}
			onInput={(event: Event) => setNote((event.target as HTMLTextAreaElement).value)}
		/>
		<output aria-label="Character count">
			{note.length + ' / 80'}
		</output>
		<button disabled={trimmed === ''} onClick={() => props.onSave(trimmed)}>{'Save note'}</button>
	</main>;
}
