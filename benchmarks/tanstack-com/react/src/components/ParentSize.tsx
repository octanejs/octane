import * as React from 'react';

interface ParentSizeProps {
	children: (size: { width: number; height: number }) => React.ReactNode;
	className?: string;
}

/**
 * Lightweight replacement for @visx/responsive ParentSize.
 * Uses native ResizeObserver without polling.
 */
export function ParentSize({ children, className }: ParentSizeProps) {
	const containerRef = React.useRef<HTMLDivElement>(null);
	const [size, setSize] = React.useState({ width: 0, height: 0 });

	React.useEffect(() => {
		const container = containerRef.current;
		if (!container) return;

		const updateSize = () => {
			setSize({
				width: container.offsetWidth,
				height: container.offsetHeight,
			});
		};

		updateSize();

		const resizeObserver = new ResizeObserver(updateSize);
		resizeObserver.observe(container);

		return () => resizeObserver.disconnect();
	}, []);

	return (
		<div ref={containerRef} className={className} style={{ width: '100%', height: '100%' }}>
			{size.width > 0 && children(size)}
		</div>
	);
}
