'use strong';
// Alternative: measure in an animation frame. Frame callbacks run before the
// browser paints, and Strong treats them as event-driven, so the update is
// legal. Reading `text` makes the effect run again when the text changes.
// useLayoutSnapshot is preferred: it needs no second state value or frame.
import { useLayoutEffect, useRef, useState } from 'octane';

export function App({ text }: { text: string }) @{
	const label = useRef<HTMLSpanElement | null>(null);
	const [width, setWidth] = useState(0);

	useLayoutEffect(() => {
		// Measure in the next frame, once the browser has laid out this text.
		const frame = requestAnimationFrame(() => {
			if (label.current?.textContent === text) setWidth(label.current.offsetWidth);
		});
		return () => cancelAnimationFrame(frame);
	});

	<figure>
		<span ref={label}>{text as string}</span>
		<figcaption>{`${width}px wide` as string}</figcaption>
	</figure>
}
