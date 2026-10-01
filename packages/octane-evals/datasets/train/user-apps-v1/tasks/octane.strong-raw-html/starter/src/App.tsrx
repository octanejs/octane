'use strong';
import { useEffect, useRef } from 'octane';

// `html` is produced by the release pipeline's sanitizer and is safe to render.
export function App({ html }: { html: string }) @{
	const notes = useRef<HTMLElement | null>(null);

	useEffect(() => {
		notes.current!.innerHTML = html;
	});

	<article ref={notes} class="release-notes" />
}
