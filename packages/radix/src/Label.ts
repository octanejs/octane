// Ported from @radix-ui/react-label. A `<label>` that suppresses text selection on
// double-click (but not when the pointer is on a form control inside it). octane events
// are native + delegated, so the `onMouseDown` handler chains the user's via
// composeEventHandlers and reads the real `event.detail` / `event.defaultPrevented`.
import { createElement } from 'octane';

import { composeEventHandlers } from './compose-event-handlers';
import { Primitive } from './Primitive';

export function Label(props: any): any {
	const { onMouseDown, ...rest } = props ?? {};
	return createElement(Primitive.label, {
		...rest,
		onMouseDown: composeEventHandlers(
			onMouseDown,
			(event: MouseEvent) => {
				// Only prevent text selection if clicking inside the label itself (not a control).
				const target = event.target as HTMLElement;
				if (target.closest('button, input, select, textarea')) return;
				// Prevent text selection when double-clicking a label.
				if (!event.defaultPrevented && event.detail > 1) {
					event.preventDefault();
				}
			},
			{ checkForDefaultPrevented: false },
		),
	});
}

export { Label as Root };
