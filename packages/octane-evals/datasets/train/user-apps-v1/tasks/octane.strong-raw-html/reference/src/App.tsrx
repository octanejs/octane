'use strong';
import { trustHTML } from 'octane';

// `html` is produced by the release pipeline's sanitizer and is safe to render.
export function App({ html }: { html: string }) @{
	<article class="release-notes" dangerouslySetInnerHTML={trustHTML(html)} />
}
