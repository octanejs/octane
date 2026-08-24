import Waypoint from 'react-waypoint';

Waypoint.above satisfies string;
Waypoint.below satisfies string;
Waypoint.inside satisfies string;
Waypoint.invisible satisfies string;
const Component = Waypoint;
void Component;

// @ts-expect-error upstream position statics are strings
const invalidPosition: number = Waypoint.above;
void invalidPosition;
