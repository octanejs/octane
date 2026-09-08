/** @jsxImportSource octane */
import { FloatingFocusManager, FloatingPortal, useFloating } from '../../src';
import { useState } from 'octane';

export function FocusKeyStabilityApp() {
	const [disabled, setDisabled] = useState(false);
	const floating = useFloating({ open: true, onOpenChange: () => {} });

	return (
		<div>
			<button class="toggle-guards" onClick={() => setDisabled((value) => !value)}>
				toggle guards
			</button>
			<FloatingPortal>
				<FloatingFocusManager
					context={floating.context}
					disabled={disabled}
					initialFocus={-1}
					visuallyHiddenDismiss="Dismiss"
				>
					<div class="managed-content" ref={floating.refs.setFloating}>
						content
					</div>
				</FloatingFocusManager>
			</FloatingPortal>
		</div>
	);
}
