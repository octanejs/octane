// Gap-2 probe: a slot that renders a HOST element on one render and a COMPONENT on another.
// A server/client divergence here is a component-vs-host structural mismatch.

function Inner(props) @{
	<b class="inner">{props.label as string}</b>
}

export function Swap(props) @{
	<div id="swap">
		@if (props.host) {
			<p class="host">{'H' as string}</p>
		} @else {
			<Inner label="C" />
		}
	</div>
}
