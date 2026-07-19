// The SVG glyphs the toolbar widget uses, transcribed from react-scan's icon
// sprite (web/components/svg-sprite + web/views/notifications/icons): the
// inspect crosshair/focus glyphs, the notifications bell, the close ×, the
// History clear (circle + slash), the pointer/keyboard interaction markers, and
// the Alerts volume-on/off speakers. Kept as inline markup so the plain
// shadow-DOM widget can drop them into a button without a build-time sprite.
// Every icon is 24×24, stroke-based, `currentColor`, sized to 1em so the host
// button's font-size controls the glyph size.
function icon(paths: string): string {
	return `<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`;
}

const CURSOR_PATH =
	'<path d="M12.034 12.681a.498.498 0 0 1 .647-.647l9 3.5a.5.5 0 0 1-.033.943l-3.444 1.068a1 1 0 0 0-.66.66l-1.067 3.443a.5.5 0 0 1-.943.033z" />';

export const INSPECT_ICON = icon(
	`${CURSOR_PATH}<path d="M5 3a2 2 0 0 0-2 2" /><path d="M19 3a2 2 0 0 1 2 2" /><path d="M5 21a2 2 0 0 1-2-2" /><path d="M9 3h1" /><path d="M9 21h2" /><path d="M14 3h1" /><path d="M3 9v1" /><path d="M21 9v2" /><path d="M3 14v1" />`,
);

export const FOCUS_ICON = icon(
	`${CURSOR_PATH}<path d="M21 11V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h6" />`,
);

export const BELL_ICON = icon(
	`<path d="M10.268 21a2 2 0 0 0 3.464 0" /><path d="M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326" />`,
);

export const CLOSE_ICON = icon(
	`<line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />`,
);

// react-scan's clear glyph is a "prohibited" circle-with-slash.
export const CLEAR_ICON = icon(
	`<circle cx="12" cy="12" r="10" /><line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />`,
);

export const POINTER_ICON = icon(CURSOR_PATH);

export const KEYBOARD_ICON = icon(
	`<path d="M10 8h.01" /><path d="M12 12h.01" /><path d="M14 8h.01" /><path d="M16 12h.01" /><path d="M18 8h.01" /><path d="M6 8h.01" /><path d="M7 16h10" /><path d="M8 12h.01" /><rect width="20" height="16" x="2" y="4" rx="2" />`,
);

export const VOLUME_ON_ICON = icon(
	`<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" /><path d="M15.54 8.46a5 5 0 0 1 0 7.07" /><path d="M19.07 4.93a10 10 0 0 1 0 14.14" />`,
);

export const VOLUME_OFF_ICON = icon(
	`<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" /><line x1="23" y1="9" x2="17" y2="15" /><line x1="17" y1="9" x2="23" y2="15" />`,
);
