'use strong';
// Workaround: sort in the event handler by mutating the snapshot, then set it.
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
				tags.push(draft);
				tags.sort();
				setTags(tags);
			}}
		>
			{'Add tag'}
		</button>
	</section>
}
