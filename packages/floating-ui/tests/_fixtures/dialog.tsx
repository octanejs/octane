import { FloatingFocusManager, useFloating } from '@octanejs/floating-ui';
import { useState } from 'octane';

function DialogPanel(props) {
	return (
		<FloatingFocusManager context={props.context} modal={true}>
			<div class="dialog" ref={props.setFloating} role="dialog">
				<input class="dialog-input" />
				<button class="close" onClick={props.onClose}>
					x
				</button>
			</div>
		</FloatingFocusManager>
	);
}

export function Dialog() {
	const [open, setOpen] = useState(false);
	const f = useFloating({ open, onOpenChange: setOpen });
	return (
		<div>
			<button class="trigger" ref={f.refs.setReference} onClick={() => setOpen(true)}>
				open
			</button>
			<div class="outside">outside</div>
			{open ? (
				<DialogPanel
					context={f.context}
					setFloating={f.refs.setFloating}
					onClose={() => setOpen(false)}
				/>
			) : null}
		</div>
	);
}
