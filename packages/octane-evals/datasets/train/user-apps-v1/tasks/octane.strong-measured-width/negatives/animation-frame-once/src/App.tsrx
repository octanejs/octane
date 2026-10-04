'use strong';
// Workaround: defer the update to an animation frame. The effect reads no
// reactive value, so it runs once per mount and the width goes stale when the
// text changes.
import { useLayoutEffect, useRef, useState } from 'octane';

export function App({ text }: { text: string }) @{
	const label = useRef<HTMLSpanElement | null>(null);
	const [width, setWidth] = useState(0);

	useLayoutEffect(() => {
		const frame = requestAnimationFrame(() => setWidth(label.current!.offsetWidth));
		return () => cancelAnimationFrame(frame);
	});

	<figure>
		<span ref={label}>{text as string}</span>
		<figcaption>{`${width}px wide` as string}</figcaption>
	</figure>
}
