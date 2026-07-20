import * as React from 'react';
import * as Plot from '@observablehq/plot';

export const observablePlotClassName = 'tanstack-observable-plot';

interface PlotContainerProps {
	/** Build Plot options given the measured container width. */
	options: (width: number) => Parameters<typeof Plot.plot>[0];
	/** Fixed height in pixels. Passed through to the wrapper div. */
	height: number;
	className?: string;
	style?: React.CSSProperties;
	onClick?: (e: React.MouseEvent<HTMLDivElement>) => void;
}

export function PlotContainer({ options, height, className, style, onClick }: PlotContainerProps) {
	const containerRef = React.useRef<HTMLDivElement>(null);
	const [ready, setReady] = React.useState(false);

	React.useEffect(() => {
		const container = containerRef.current;
		if (!container) return;

		let currentPlot: ReturnType<typeof Plot.plot> | null = null;

		const render = () => {
			if (currentPlot) {
				currentPlot.remove();
				currentPlot = null;
			}

			const width = container.clientWidth;
			if (width === 0) return;

			currentPlot = Plot.plot({ ...options(width), width, height });
			const svg =
				currentPlot instanceof SVGSVGElement ? currentPlot : currentPlot.querySelector('svg');
			svg?.classList.add(observablePlotClassName);
			if (svg) svg.style.overflow = 'visible';
			container.appendChild(currentPlot);
			setReady(true);
		};

		render();

		const observer = new ResizeObserver(render);
		observer.observe(container);

		return () => {
			observer.disconnect();
			if (currentPlot) currentPlot.remove();
		};
	}, [options, height]);

	const handleKeyDown = React.useCallback(
		(e: React.KeyboardEvent<HTMLDivElement>) => {
			if (!onClick || (e.key !== 'Enter' && e.key !== ' ')) return;
			e.preventDefault();
			// Synthesize a click at the container center for keyboard users
			const el = e.currentTarget;
			const rect = el.getBoundingClientRect();
			const synth = new MouseEvent('click', {
				bubbles: true,
				clientX: rect.left + rect.width / 2,
				clientY: rect.top + rect.height / 2,
			});
			el.dispatchEvent(synth);
		},
		[onClick],
	);

	return (
		<div
			ref={containerRef}
			className={`${!ready ? 'animate-pulse rounded bg-gray-100 dark:bg-gray-800/40' : ''} ${className ?? ''}`}
			style={{ width: '100%', height, ...style }}
			onClick={onClick}
			onKeyDown={onClick ? handleKeyDown : undefined}
			role={onClick ? 'button' : undefined}
			tabIndex={onClick ? 0 : undefined}
			aria-label={onClick ? 'Interactive chart' : undefined}
		/>
	);
}
