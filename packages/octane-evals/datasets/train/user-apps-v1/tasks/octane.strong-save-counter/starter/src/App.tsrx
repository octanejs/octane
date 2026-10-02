'use strong';
import { useEffect, useState } from 'octane';

export function App({ save }: { save: () => Promise<void> }) @{
	const [status, setStatus] = useState('idle');
	const [saves, setSaves] = useState(0);

	useEffect(() => {
		if (status === 'saved') {
			setSaves(saves + 1);
			setStatus('idle');
		}
	});

	<section>
		<button
			onClick={async () => {
				setStatus('saving');
				await save();
				setStatus('saved');
			}}
		>
			{'Save'}
		</button>
		<p>{`Saved ${saves} times` as string}</p>
	</section>
}
