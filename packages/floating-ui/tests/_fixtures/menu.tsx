import { useClick, useDismiss, useFloating, useInteractions, useRole } from '@octanejs/floating-ui';
import { useState } from 'octane';

// Exercises useClick (toggle open) + useDismiss (escape / outside-press) + useRole.
export function Menu() {
	const [open, setOpen] = useState(false);
	const f = useFloating({ open, onOpenChange: setOpen });
	const click = useClick(f.context);
	const dismiss = useDismiss(f.context);
	const role = useRole(f.context, { role: 'menu' });
	const { getReferenceProps, getFloatingProps } = useInteractions([click, dismiss, role]);

	return (
		<div>
			<button class="trigger" ref={f.refs.setReference} {...getReferenceProps()}>
				menu
			</button>
			{open ? (
				<div class="menu" ref={f.refs.setFloating} {...getFloatingProps()}>
					items
				</div>
			) : null}
		</div>
	);
}
