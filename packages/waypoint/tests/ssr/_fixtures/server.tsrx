import Waypoint from '@octanejs/waypoint';

export function ServerWaypoint() @{
	<main>
		<Waypoint />
		<Waypoint children={<div id="custom">Marker</div>} />
	</main>
}
