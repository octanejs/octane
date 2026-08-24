import * as WaypointPackage from '@octanejs/waypoint';
import { expectTypeOf } from 'vitest';

WaypointPackage.default satisfies (props: Record<never, never>) => object;
WaypointPackage.Waypoint satisfies (props: Record<never, never>) => object;
WaypointPackage.Waypoint.above satisfies typeof WaypointPackage.ABOVE;
WaypointPackage.Waypoint.below satisfies typeof WaypointPackage.BELOW;
WaypointPackage.Waypoint.inside satisfies typeof WaypointPackage.INSIDE;
WaypointPackage.Waypoint.invisible satisfies typeof WaypointPackage.INVISIBLE;
WaypointPackage.ABOVE satisfies 'above';
WaypointPackage.BELOW satisfies 'below';
WaypointPackage.INSIDE satisfies 'inside';
WaypointPackage.INVISIBLE satisfies 'invisible';
WaypointPackage.findScrollableAncestor satisfies (
	node: Element,
	horizontal?: boolean,
) => Element | Window;
WaypointPackage.getBounds satisfies (
	node: Element,
	ancestor: Element | Window,
	props: {
		topOffset?: string | number;
		bottomOffset?: string | number;
		horizontal?: boolean;
	},
) => {
	waypointTop: number;
	waypointBottom: number;
	viewportTop: number;
	viewportBottom: number;
};
WaypointPackage.getCurrentPosition satisfies (
	bounds: {
		waypointTop: number;
		waypointBottom: number;
		viewportTop: number;
		viewportBottom: number;
	} | null,
) => 'above' | 'below' | 'inside' | 'invisible';
WaypointPackage.parseOffset satisfies (value: string | number | undefined, size: number) => number;
WaypointPackage.resolveScrollableAncestorProp satisfies (
	ancestor: Window | Element | 'window',
) => Window | Element;
expectTypeOf<WaypointPackage.WaypointBounds>().toEqualTypeOf<{
	waypointTop: number;
	waypointBottom: number;
	viewportTop: number;
	viewportBottom: number;
}>();
expectTypeOf<WaypointPackage.WaypointCallbackArgs>().toMatchTypeOf<{
	currentPosition: 'above' | 'below' | 'inside' | 'invisible';
	previousPosition: 'above' | 'below' | 'inside' | 'invisible' | undefined;
	event: Event | null;
}>();
expectTypeOf<WaypointPackage.WaypointPosition>().toEqualTypeOf<
	'above' | 'below' | 'inside' | 'invisible'
>();
expectTypeOf<WaypointPackage.WaypointProps>().toMatchTypeOf<{
	onEnter?: (args: WaypointPackage.WaypointCallbackArgs) => void;
	topOffset?: string | number;
	horizontal?: boolean;
}>();

// @ts-expect-error public callbacks must be functions
const invalidProps: WaypointPackage.WaypointProps = { onEnter: 'nope' };
void invalidProps;
