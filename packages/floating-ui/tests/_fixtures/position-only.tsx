/** @jsxImportSource octane */
import {
	offset,
	useFloating,
	type UseFloatingOptions,
	type UseFloatingReturn,
} from '@octanejs/floating-ui/react-dom';

export function PositionOnly({
	gap,
	observe,
	subscribe,
}: {
	gap: number;
	observe: (value: UseFloatingReturn) => void;
	subscribe: UseFloatingOptions['whileElementsMounted'];
}) {
	const floating = useFloating({
		placement: 'bottom-start',
		middleware: [offset(() => gap, [gap])],
		whileElementsMounted: subscribe,
	});
	const defaults = useFloating();
	observe(floating);
	return (
		<div data-default-placement={defaults.placement}>
			<button ref={floating.refs.setReference}>anchor</button>
			<span ref={floating.refs.setFloating} style={floating.floatingStyles}>
				panel
			</span>
		</div>
	);
}
