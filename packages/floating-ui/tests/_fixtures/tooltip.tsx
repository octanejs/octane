import { flip, offset, shift, useFloating } from '@octanejs/floating-ui';

export function Tooltip() {
	const f = useFloating({
		placement: 'bottom',
		middleware: [offset(8), flip(), shift()],
	});

	return (
		<div>
			<button class="ref" ref={f.refs.setReference}>
				ref
			</button>
			<div
				class="floating"
				ref={f.refs.setFloating}
				style={f.floatingStyles}
				data-positioned={f.isPositioned ? '1' : '0'}
			>
				tip
			</div>
		</div>
	);
}

// Two independent useFloating calls in ONE component — exercises per-call slot
// isolation (the caller injects a distinct slot per call site, each threaded
// through subSlot).
export function TwoTooltips() {
	const a = useFloating({ placement: 'top' });
	const b = useFloating({ placement: 'right' });
	return (
		<div>
			<button class="ref-a" ref={a.refs.setReference}>
				a
			</button>
			<div class="float-a" ref={a.refs.setFloating} data-pos={a.placement}>
				A
			</div>
			<button class="ref-b" ref={b.refs.setReference}>
				b
			</button>
			<div class="float-b" ref={b.refs.setFloating} data-pos={b.placement}>
				B
			</div>
		</div>
	);
}
