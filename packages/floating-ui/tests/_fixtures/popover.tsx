import { useFloating, useInteractions, useRole } from '@octanejs/floating-ui';
import { useState } from 'octane';

// Composition: useFloating (context + open/onOpenChange) + useRole (ARIA) +
// useInteractions (merged prop getters, incl. a merged onClick).
export function Popover() {
	const [open, setOpen] = useState(false);
	const f = useFloating({ open, onOpenChange: setOpen, placement: 'bottom' });
	const role = useRole(f.context, { role: 'menu' });
	const { getReferenceProps, getFloatingProps } = useInteractions([role]);

	const refProps = getReferenceProps({ onClick: () => setOpen(!open) });

	return (
		<div>
			<button class="trigger" ref={f.refs.setReference} {...refProps}>
				open
			</button>
			{open ? (
				<div class="menu" ref={f.refs.setFloating} {...getFloatingProps()}>
					menu
				</div>
			) : null}
		</div>
	);
}
