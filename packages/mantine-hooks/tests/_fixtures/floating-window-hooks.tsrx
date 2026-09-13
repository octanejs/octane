import { useFloatingWindow, type UseFloatingWindowOptions } from '@octanejs/mantine-hooks';

export function FloatingWindowHarness({
	show,
	options,
}: {
	show: boolean;
	options?: UseFloatingWindowOptions;
}) @{
	const { ref } = useFloatingWindow<HTMLDivElement>({ constrainToViewport: true, ...options });

	<section>
		@if (show) {
			<div id="floating-window" ref={ref} />
		}
	</section>
}
