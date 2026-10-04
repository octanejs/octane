'use strong';
// Workaround: defer the update with a timer that has a positive delay. The
// browser paints 0px wide before the timer fires.
import { useLayoutEffect, useRef, useState } from 'octane';

export function App({ text }: { text: string }) @{
	const label = useRef<HTMLSpanElement | null>(null);
	const [width, setWidth] = useState(0);

	useLayoutEffect(() => {
		const timer = setTimeout(() => setWidth(label.current!.offsetWidth), 16);
		return () => clearTimeout(timer);
	});

	<figure>
		<span ref={label}>{text as string}</span>
		<figcaption>{`${width}px wide` as string}</figcaption>
	</figure>
}
