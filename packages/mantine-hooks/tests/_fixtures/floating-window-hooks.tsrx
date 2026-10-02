import { useFloatingWindow } from '@octanejs/mantine-hooks';

export function FloatingWindowHarness({ show }: { show: boolean }) @{
	const { ref } = useFloatingWindow<HTMLDivElement>({ constrainToViewport: true });

	<section>
		@if (show) {
			<div id="floating-window" ref={ref} />
		}
	</section>
}

export function DraggableWindowHarness({
	enabled,
	log,
}: {
	enabled: boolean;
	log: (event: string) => void;
}) @{
	const { ref } = useFloatingWindow<HTMLDivElement>({
		enabled,
		constrainToViewport: false,
		onDragStart: () => log('start'),
		onPositionChange: ({ x, y }) => log(`move:${x},${y}`),
		onDragEnd: () => log('end'),
	});

	<div id="floating-window" ref={ref} />
}
