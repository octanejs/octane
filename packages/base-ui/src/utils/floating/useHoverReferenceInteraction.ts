// STUB — the full open-on-hover interaction (Base UI's useHoverReferenceInteraction + useHover +
// safePolygon, ~1400 lines) is deferred. It is only active when a trigger sets `openOnHover` (off by
// default), so returning `{}` here leaves click-to-open Popover/Tooltip fully functional. `safePolygon`
// is a placeholder passed to `handleClose` (ignored while the hook is inert). TODO: port the real
// hover (useHover pointer tracking + safePolygon "safe area" close intent) when hover-open tests land.

export function safePolygon(): (...args: any[]) => any {
	return () => undefined;
}

export function useHoverReferenceInteraction(
	_context: any,
	_props: any,
	_slot?: symbol | undefined,
): Record<string, any> {
	return {};
}
