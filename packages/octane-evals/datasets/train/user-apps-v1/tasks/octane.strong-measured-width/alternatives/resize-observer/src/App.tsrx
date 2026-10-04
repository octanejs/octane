'use strong';
// Alternative: observe the label's size. ResizeObserver delivers the new size
// after layout and before paint, and its callback is an event-driven update.
// useLayoutSnapshot is the direct repair for a size that changes only when the
// component commits; an observer also follows changes made without a commit,
// such as a web font loading.
import { useLayoutEffect, useRef, useState } from 'octane';

export function App({ text }: { text: string }) @{
	const label = useRef<HTMLSpanElement | null>(null);
	const [width, setWidth] = useState(0);

	useLayoutEffect(() => {
		const observer = new ResizeObserver(([entry]) => {
			setWidth(Math.round(entry.borderBoxSize[0].inlineSize));
		});
		observer.observe(label.current!);
		return () => observer.disconnect();
	});

	<figure>
		<span ref={label}>{text as string}</span>
		<figcaption>{`${width}px wide` as string}</figcaption>
	</figure>
}
