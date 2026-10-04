'use strong';
import { useLayoutEffect, useRef, useState } from 'octane';

export function App({ text }: { text: string }) @{
	const label = useRef<HTMLSpanElement | null>(null);
	const [width, setWidth] = useState(0);

	useLayoutEffect(() => {
		setWidth(label.current!.offsetWidth);
	});

	<figure>
		<span ref={label}>{text as string}</span>
		<figcaption>{`${width}px wide` as string}</figcaption>
	</figure>
}
