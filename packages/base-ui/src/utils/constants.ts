// Ported from .base-ui/packages/react/src/internals/constants.ts (v1.6.0) — the subset the
// overlay/positioner layer needs. `POPUP_COLLISION_AVOIDANCE` is the default collision config
// popups pass to `useAnchorPositioning`; `DISABLED_TRANSITIONS_STYLE` disables transitions while
// a popup is in the `starting` transition phase (so the mount frame doesn't animate).
export const POPUP_COLLISION_AVOIDANCE = {
	fallbackAxisSide: 'end',
} as const;

export const DISABLED_TRANSITIONS_STYLE = { style: { transition: 'none' } } as const;
