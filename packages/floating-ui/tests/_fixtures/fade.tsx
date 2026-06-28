import { useFloating, useTransitionStyles } from '@octanejs/floating-ui';
import { useState } from 'octane';

export function FadeTooltip() {
	const [open, setOpen] = useState(false);
	const f = useFloating({ open, onOpenChange: setOpen, placement: 'top' });
	const { isMounted, styles } = useTransitionStyles(f.context, { duration: 200 });
	return (
		<div>
			<button class="trigger" ref={f.refs.setReference} onClick={() => setOpen((o) => !o)}>
				t
			</button>
			{isMounted ? (
				<div class="tip" ref={f.refs.setFloating} style={styles}>
					tip
				</div>
			) : null}
		</div>
	);
}
