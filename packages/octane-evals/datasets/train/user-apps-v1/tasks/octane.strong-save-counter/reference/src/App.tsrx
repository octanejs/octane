'use strong';
import { useState } from 'octane';

export function App({ save }: { save: () => Promise<void> }) @{
	const [saves, setSaves] = useState(0);

	<section>
		<button
			onClick={async () => {
				await save();
				setSaves((count) => count + 1);
			}}
		>{'Save'}</button>
		<p>{`Saved ${saves} times` as string}</p>
	</section>
}
