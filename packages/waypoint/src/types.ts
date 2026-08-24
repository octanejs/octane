export const ABOVE = 'above';
export const BELOW = 'below';
export const INSIDE = 'inside';
export const INVISIBLE = 'invisible';

export type WaypointPosition = typeof ABOVE | typeof BELOW | typeof INSIDE | typeof INVISIBLE;

export interface WaypointCallbackArgs {
	currentPosition: WaypointPosition;
	previousPosition: WaypointPosition | undefined;
	event: Event | null;
	waypointTop: number;
	waypointBottom: number;
	viewportTop: number;
	viewportBottom: number;
}

export interface WaypointProps {
	onEnter?(args: WaypointCallbackArgs): void;
	onLeave?(args: WaypointCallbackArgs): void;
	onPositionChange?(args: WaypointCallbackArgs): void;
	topOffset?: string | number;
	bottomOffset?: string | number;
	horizontal?: boolean;
	fireOnRapidScroll?: boolean;
	scrollableAncestor?: Window | Element | 'window';
	/** A single element, matching react-waypoint's runtime contract. */
	children?: object | null;
	debug?: boolean;
}

export interface WaypointBounds {
	waypointTop: number;
	waypointBottom: number;
	viewportTop: number;
	viewportBottom: number;
}
