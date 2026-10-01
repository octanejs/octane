'use strong';
import { useState } from 'octane';

export function App() @{
	const [tags, setTags] = useState(['octane', 'react']);
	const [draft, setDraft] = useState('');
	tags.sort();

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
				setTags([...tags, draft]);
			}}
		>{'Add tag'}</button>
	</section>
}
