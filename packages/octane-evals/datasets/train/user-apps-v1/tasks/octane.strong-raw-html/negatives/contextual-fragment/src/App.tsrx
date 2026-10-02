'use strong';
// Workaround: build a fragment with a Range instead of assigning innerHTML.
import { useEffect, useRef } from 'octane';

export function App({ html }: { html: string }) @{
	const notes = useRef<HTMLElement | null>(null);

	useEffect(() => {
		notes.current!.replaceChildren(document.createRange().createContextualFragment(html));
	});

	<article ref={notes} class="release-notes" />
}
