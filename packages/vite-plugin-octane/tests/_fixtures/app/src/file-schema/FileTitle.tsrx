import { useEffect, useState } from 'octane';

module server {
	import { dataSchema as s } from 'octane/data';
	import { readLibraryTitle } from './library.server';

	export const fileId = s.string({ minLength: 1 });
	export const file = s.object({ title: s.string() });

	export async function readFile(id: string) {
		return file.parse({ title: readLibraryTitle(fileId.parse(id)) });
	}
}

export function FileTitle() @{
	const [title, setTitle] = useState('');
	const [ready, setReady] = useState(false);
	useEffect(() => {
		setReady(true);
	}, []);
	async function openFile() {
		const reply = await readFile(fileId.parse('draft'));
		try {
			setTitle(file.parse(reply).title);
		} catch {
			setTitle('Invalid file reply');
		}
	}
	<>
		<button disabled={!ready} onClick={openFile}>
			Open draft
		</button>
		<output>{title as string}</output>
	</>
}
