import { ABOVE, BELOW, INSIDE, INVISIBLE, type WaypointProps } from './types';

export declare const Waypoint: ((props: WaypointProps) => object) & {
	above: typeof ABOVE;
	below: typeof BELOW;
	inside: typeof INSIDE;
	invisible: typeof INVISIBLE;
};
