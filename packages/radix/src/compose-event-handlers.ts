// Ported from @radix-ui/primitive. Chains an original (user) handler with our behavior
// handler, skipping ours if the user called preventDefault. octane events are native, so
// `event.defaultPrevented` is the real DOM flag.
export function composeEventHandlers<E extends { defaultPrevented: boolean }>(
	originalEventHandler?: (event: E) => void,
	ourEventHandler?: (event: E) => void,
	{ checkForDefaultPrevented = true } = {},
): (event: E) => void {
	return function handleEvent(event: E) {
		originalEventHandler?.(event);
		if (checkForDefaultPrevented === false || !event.defaultPrevented) {
			return ourEventHandler?.(event);
		}
	};
}
