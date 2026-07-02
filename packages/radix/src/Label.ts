// Ported from @radix-ui/react-label (source:
// .radix-primitives/packages/react/label/src/label.tsx). A `<label>` that suppresses text
// selection on double-click. Faithful ordering: presses on a form control INSIDE the
// label return early — before the user's own `onMouseDown` runs. octane events are
// native + delegated, so `event.detail` / `event.defaultPrevented` are the real DOM flags.
import { createElement } from 'octane';

import { Primitive } from './Primitive';

export function Label(props: any): any {
	return createElement(Primitive.label, {
		...props,
		onMouseDown: (event: MouseEvent) => {
			// Only prevent text selection if clicking inside the label itself.
			const target = event.target as HTMLElement;
			if (target.closest('button, input, select, textarea')) return;

			props?.onMouseDown?.(event);
			// Prevent text selection when double clicking label.
			if (!event.defaultPrevented && event.detail > 1) event.preventDefault();
		},
	});
}

export { Label as Root };
