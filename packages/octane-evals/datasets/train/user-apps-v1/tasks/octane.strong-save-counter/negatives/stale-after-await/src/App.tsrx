'use strong';
// Workaround: count in the handler from the snapshot captured before the await.
import { useState } from 'octane';

export function App({ save }: { save: () => Promise<void> }) @{
	const [saves, setSaves] = useState(0);

	<section>
		<button
			onClick={async () => {
				await save();
				setSaves(saves + 1);
			}}
		>
			{'Save'}
		</button>
		<p>{`Saved ${saves} times` as string}</p>
	</section>
}
