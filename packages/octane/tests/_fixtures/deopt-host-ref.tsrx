// A value-position host descriptor (`{cond ? <span ref={r}/> : null}`) — routed through the
// runtime de-opt renderer, whose object/callback ref must be detached when the node is removed.
export function RefHost(props) @{
	<div id="wrap">
		{props.show ? <span id="d" class="tracked" ref={props.r} /> : null}
	</div>
}
