'use strong';
// Workaround: parse the HTML in a detached <template> and append its content.
import { useEffect, useRef } from 'octane';

export function App({ html }: { html: string }) @{
	const notes = useRef<HTMLElement | null>(null);

	useEffect(() => {
		const template = document.createElement('template');
		template.innerHTML = html;
		notes.current!.replaceChildren(template.content.cloneNode(true));
	});

	<article ref={notes} class="release-notes" />
}
