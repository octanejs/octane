'use strong';
// Workaround: mutate the previous state inside a functional updater.
import { useState } from 'octane';

export function App() @{
	const [tags, setTags] = useState(['octane', 'react']);
	const [draft, setDraft] = useState('');

	<section>
		<ul>
			@for (const tag of tags; key tag) {
				<li>{tag as string}</li>
			}
		</ul>
		<input
			aria-label="New tag"
			value={draft}
			onInput={(event) => setDraft(event.currentTarget.value)}
		/>
		<button
			onClick={() => {
				setTags((current) => {
					current.push(draft);
					current.sort();
					return current;
				});
			}}
		>
			{'Add tag'}
		</button>
	</section>
}
