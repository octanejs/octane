import type React from 'react';

// Disabled ad positions — these return null for now.
// They will be re-enabled when private partner ad campaigns are active.

export function GamHeader(
	_props: React.HTMLAttributes<HTMLDivElement> & {
		adClassName?: string;
	},
) {
	return null;
}

export function GamFooter(
	_props?: React.HTMLAttributes<HTMLDivElement> & {
		adClassName?: string;
		placeholderClassName?: string;
		popupPosition?: 'top' | 'bottom';
		borderClassName?: string;
		style?: React.CSSProperties;
	},
) {
	return null;
}

export function GamRightRailSquare() {
	return null;
}

export function GamLeftRailSquare() {
	return null;
}

// No-ops — the external ad SDK is gone, these are kept for API compat.
export function GamScripts() {
	return null;
}

export function GamOnPageChange() {
	// intentional no-op
}
