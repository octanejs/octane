// Ported from .base-ui/packages/react/src/internals/constants.ts (v1.6.0) — the subset the
// overlay/positioner layer needs. `POPUP_COLLISION_AVOIDANCE` is the default collision config
// popups pass to `useAnchorPositioning`; `DISABLED_TRANSITIONS_STYLE` disables transitions while
// a popup is in the `starting` transition phase (so the mount frame doesn't animate).

/**
 * Used by regular popups that usually aren't scrollable and are allowed to
 * freely flip to any axis of placement.
 */
export const POPUP_COLLISION_AVOIDANCE = {
	fallbackAxisSide: 'end',
} as const;

/**
 * Used for dropdowns that usually strictly prefer top/bottom placements and
 * use `var(--available-height)` to limit their height.
 */
export const DROPDOWN_COLLISION_AVOIDANCE = {
	fallbackAxisSide: 'none',
} as const;

export const DISABLED_TRANSITIONS_STYLE = { style: { transition: 'none' } } as const;

/** How long a typeahead buffer survives without a keystroke before it resets. */
export const TYPEAHEAD_RESET_MS = 500;

/**
 * How long after a hover-open a click is still treated as "patient" (and therefore does not
 * immediately close the popup it just opened).
 */
export const PATIENT_CLICK_THRESHOLD = 500;
