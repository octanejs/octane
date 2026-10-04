'use strong';
import { useLayoutSnapshot, useRef } from 'octane';

export function App({ text }: { text: string }) @{
	const label = useRef<HTMLSpanElement | null>(null);
	const width = useLayoutSnapshot(() => label.current?.offsetWidth ?? 0, { initial: 0 });

	<figure>
		<span ref={label}>{text as string}</span>
		<figcaption>{`${width}px wide` as string}</figcaption>
	</figure>
}
