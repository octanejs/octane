// Write-path fixtures. `WritePathSpread` is an aggregated spread host: every
// commit resolves the sources into one prop record, so an unchanged record
// bails the whole write tail and a changed `data-*` key exercises the lean
// attribute writer. `WritePathEdge` mirrors the svg-dashboard pulse row —
// `class`/`d`/`style` plus an `attrs` spread on an SVG element.

export function WritePathSpread(props) @{
	<section>
		<span id="wp-tick">{props.tick as string}</span>
		<div id="wp-spread" {...props.spread} />
	</section>
}

export function WritePathEdge(props) @{
	<svg>
		<path id="wp-edge" class={props.cls} d={props.d} style={props.style} {...props.attrs} />
	</svg>
}
