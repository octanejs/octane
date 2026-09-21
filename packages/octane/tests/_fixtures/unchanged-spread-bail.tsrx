// Spread hosts that re-render with unchanged resolved props — the surface the
// resolved-record commit bail must leave untouched. Each fixture pairs the
// spread host with a `tick` sibling so a test can prove a real commit ran
// while the host itself received no writes.

export function UnchangedSpreadRow(props) @{
	<section id="unchanged-spread-row">
		<span id="tick">{props.tick as string}</span>
		<div id="spread-target" {...props.spread} />
	</section>
}

export function UnchangedSpreadLabel(props) @{
	<section>
		<span id="label-tick">{props.tick as string}</span>
		<label id="spread-label" {...props.spread}>label</label>
	</section>
}

export function UnchangedSpreadInput(props) @{
	<section>
		<span id="input-tick">{props.tick as string}</span>
		<input id="spread-input" {...props.spread} readOnly />
	</section>
}

export function UnchangedSpreadCustom(props) @{
	<section>
		<span id="custom-tick">{props.tick as string}</span>
		<octane-unchanged-spread id="spread-custom" {...props.spread} />
	</section>
}

export function UnchangedSpreadScoped(props) @{
	<>
		<style>
			.uss-scope {
				color: rgb(1, 2, 3);
			}
		</style>
		<section>
			<span id="scoped-tick">{props.tick as string}</span>
			<div id="spread-scoped" class="uss-scope" {...props.spread} />
		</section>
	</>
}

export function UnchangedSpreadDanger(props) @{
	<section>
		<span id="danger-tick">{props.tick as string}</span>
		<div id="spread-danger" {...props.spread} />
	</section>
}
