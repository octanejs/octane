import { createResizeObserver, useEffect, useRef, useState } from 'octane';

export type ResizeFeedbackProps = {
	observe: boolean;
	expose(update: (width: number) => void): void;
	ready(): void;
};

export function ResizeFeedback(props: ResizeFeedbackProps) @{
	const [width, setWidth] = useState(100);
	const inner = useRef<HTMLDivElement | null>(null);
	props.expose(setWidth);
	useEffect(() => {
		if (!props.observe) {
			props.ready();
			return;
		}
		const observer = createResizeObserver((entries) => {
			setWidth(Math.min(entries[0].contentRect.width + 20, 140));
		});
		observer.observe(inner.current!);
		props.ready();
		return () => observer.disconnect();
	}, []);
	<div data-panel style={{ width: width + 'px' }}>
		<div data-observed ref={inner} style={{ width: '100%', height: '30px' }} />
	</div>
}
