import { useFloatingWindow } from '@octanejs/mantine-hooks';

export function FloatingWindowHarness({ show }: { show: boolean }) @{
	const { ref } = useFloatingWindow<HTMLDivElement>({ constrainToViewport: true });

	<section>
		@if (show) {
			<div id="floating-window" ref={ref} />
		}
	</section>
}
