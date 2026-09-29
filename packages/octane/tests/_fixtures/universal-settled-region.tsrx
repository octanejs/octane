import { bindRendererRegionOwner, use } from 'octane';

// A reverse-region DOM child whose suspension routes to its universal owner and
// keeps suspending on a wakeable whose settlement has already been observed.
export function SettledRegionChild(props) @{
	bindRendererRegionOwner(props);
	if (!props.gate.check()) use(props.gate.wakeable);
	<p class="resolved">{props.gate.label as string}</p>
}
