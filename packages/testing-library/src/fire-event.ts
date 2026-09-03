import { fireEvent as domFireEvent } from '@testing-library/dom';

// Keep the DOM helpers independent: callers importing @testing-library/dom
// directly still get one native event per helper. Octane's onFocus/onBlur
// delegation listens to focusin/focusout, so those two convenience helpers
// emit native focus/blur followed by the corresponding bubbling event.
export const fireEvent: typeof domFireEvent = Object.assign(
	(...args: Parameters<typeof domFireEvent>) => domFireEvent(...args),
	domFireEvent,
);

fireEvent.focus = (element, options) => {
	const result = domFireEvent.focus(element, options);
	domFireEvent.focusIn(element, { ...options, bubbles: true });
	return result;
};
fireEvent.blur = (element, options) => {
	const result = domFireEvent.blur(element, options);
	domFireEvent.focusOut(element, { ...options, bubbles: true });
	return result;
};

// Other helpers retain DOM semantics: change dispatches an explicit native
// commit event; mouseEnter does not also dispatch mouseover. Use user-event
// for complete typing, click activation, and focus movement sequences.
// Commit/effect flushing uses the DOM library's eventWrapper (see pure.ts).
