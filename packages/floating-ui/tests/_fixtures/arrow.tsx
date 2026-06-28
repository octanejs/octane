import { FloatingArrow, useFloating } from '@octanejs/floating-ui';

export function ArrowApp() {
	const f = useFloating({ open: true, placement: 'bottom' });
	return (
		<div>
			<button class="ref" ref={f.refs.setReference}>
				ref
			</button>
			<div class="floating" ref={f.refs.setFloating}>
				<FloatingArrow context={f.context} strokeWidth={2} stroke="red" />
			</div>
		</div>
	);
}
