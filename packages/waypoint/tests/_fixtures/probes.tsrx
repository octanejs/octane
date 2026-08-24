import { Waypoint, type WaypointCallbackArgs } from '@octanejs/waypoint';

export function WaypointProbe(props: {
	onEnter(args: WaypointCallbackArgs): void;
	onLeave(args: WaypointCallbackArgs): void;
	onPositionChange(args: WaypointCallbackArgs): void;
	topOffset?: string | number;
	bottomOffset?: string | number;
	fireOnRapidScroll?: boolean;
	scrollableAncestor?: Window | Element | 'window';
}) @{
	<Waypoint {...props} />
}

export function ChildProbe(props: {
	onEnter(args: WaypointCallbackArgs): void;
	childRef?: (node: Element | null) => void;
	label?: string;
	hostKey?: string;
}) @{
	<Waypoint
		onEnter={props.onEnter}
		children={<div key={props.hostKey} ref={props.childRef} data-testid="child">
			{props.label ?? 'child'}
		</div>}
	/>
}
