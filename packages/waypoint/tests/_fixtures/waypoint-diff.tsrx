import Waypoint from '@octanejs/waypoint';

export function WaypointDiff() @{
	<section id="root">
		<Waypoint />
		<Waypoint children={<div id="custom">Marker</div>} />
	</section>
}
