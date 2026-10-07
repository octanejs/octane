'use strong';
// Workaround: measure the span from a callback ref. Octane calls the ref while
// the span commits, before paint, so the update is still synchronous commit work.
import { useState } from 'octane';

export function App({ text }: { text: string }) @{
	const [width, setWidth] = useState(0);

	<figure>
		<span
			ref={(el: HTMLSpanElement | null) => {
				if (el) setWidth(el.offsetWidth);
			}}
		>
			{text as string}
		</span>
		<figcaption>{`${width}px wide` as string}</figcaption>
	</figure>
}
