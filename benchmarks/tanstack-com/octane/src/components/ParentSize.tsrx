import { useEffect, useRef, useState } from 'octane';

interface ParentSizeProps {
	children: (size: { width: number; height: number }) => any;
	className?: string;
}

/**
 * Lightweight replacement for @visx/responsive ParentSize.
 * Uses native ResizeObserver without polling.
 */
export function ParentSize({ children, className }: ParentSizeProps) {
	const containerRef = useRef<HTMLDivElement>(null);
	const [size, setSize] = useState({ width: 0, height: 0 });

	useEffect(() => {
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

	return <div ref={containerRef} class={className} style={{ width: '100%', height: '100%' }}>
		{size.width > 0 && children(size)}
	</div>;
}
