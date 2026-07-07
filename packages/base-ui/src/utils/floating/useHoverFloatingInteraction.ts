// STUB — the popup side of the open-on-hover interaction (Base UI's useHoverFloatingInteraction:
// keep-open-while-hovering-popup + closeDelay + safePolygon, part of the ~1400-line hover system).
// It is only active when a trigger sets `openOnHover` (off by default), so returning nothing here
// leaves click-to-open Popover/Tooltip fully functional. TODO: port the real popup-hover keep-open
// behavior alongside `useHoverReferenceInteraction` when hover-open tests land.
export function useHoverFloatingInteraction(
	_context: any,
	_props: any,
	_slot?: symbol | undefined,
): void {
	// no-op while hover-open is out of scope
}
