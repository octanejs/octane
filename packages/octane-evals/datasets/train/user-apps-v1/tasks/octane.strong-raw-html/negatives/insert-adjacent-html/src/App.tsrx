'use strong';
// Workaround: clear the element, then insert the markup with insertAdjacentHTML.
import { useEffect, useRef } from 'octane';

export function App({ html }: { html: string }) @{
	const notes = useRef<HTMLElement | null>(null);

	useEffect(() => {
		notes.current!.replaceChildren();
		notes.current!.insertAdjacentHTML('afterbegin', html);
	});

	<article ref={notes} class="release-notes" />
}
