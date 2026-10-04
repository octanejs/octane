'use strong';
// Workaround: read the width from the ref during render.
import { useRef } from 'octane';

export function App({ text }: { text: string }) @{
	const label = useRef<HTMLSpanElement | null>(null);
	const width = label.current?.offsetWidth ?? 0;

	<figure>
		<span ref={label}>{text as string}</span>
		<figcaption>{`${width}px wide` as string}</figcaption>
	</figure>
}
