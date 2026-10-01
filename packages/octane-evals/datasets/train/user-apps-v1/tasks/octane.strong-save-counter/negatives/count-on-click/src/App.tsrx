'use strong';
// Workaround: count when the save starts instead of when it resolves.
import { useState } from 'octane';

export function App({ save }: { save: () => Promise<void> }) @{
	const [saves, setSaves] = useState(0);

	<section>
		<button
			onClick={async () => {
				setSaves((count) => count + 1);
				await save();
			}}
		>{'Save'}</button>
		<p>{`Saved ${saves} times` as string}</p>
	</section>
}
