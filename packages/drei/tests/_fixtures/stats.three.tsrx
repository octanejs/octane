import { Stats, StatsGl } from '@octanejs/drei';

export function StatsScene(props) @{
	<Stats
		showPanel={props.showPanel}
		className={props.className}
		parent={props.parent}
	/>
}

export function StatsGlScene(props) @{
	<StatsGl
		ref={props.ref}
		showPanel={props.showPanel}
		className={props.className}
		parent={props.parent}
		id={props.id}
		clearStatsGlStyle={props.clearStatsGlStyle}
		logsPerSecond={props.logsPerSecond}
	/>
}
