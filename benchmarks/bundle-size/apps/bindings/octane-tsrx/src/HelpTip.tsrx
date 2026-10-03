// Hover help bubble positioned by the floating-ui binding's interaction hooks.
import { useState } from 'octane';
import {
	autoUpdate,
	flip,
	offset,
	shift,
	useDismiss,
	useFloating,
	useHover,
	useInteractions,
	useRole,
} from '@octanejs/floating-ui';

export function HelpTip(props: { label: string }) @{
	const [open, setOpen] = useState(false);
	const floating = useFloating({
		open,
		onOpenChange: setOpen,
		placement: 'bottom',
		middleware: [offset(6), flip(), shift({ padding: 8 })],
		whileElementsMounted: autoUpdate,
	});
	const hover = useHover(floating.context, { delay: { open: 150, close: 0 } });
	const dismiss = useDismiss(floating.context);
	const role = useRole(floating.context, { role: 'tooltip' });
	const { getReferenceProps, getFloatingProps } = useInteractions([hover, dismiss, role]);

	<span class="help">
		<button ref={floating.refs.setReference} {...getReferenceProps()}>{'?'}</button>
		@if (open) {
			<span
				ref={floating.refs.setFloating}
				style={floating.floatingStyles}
				{...getFloatingProps()}
			>{props.label as string}</span>
		}
	</span>
}
