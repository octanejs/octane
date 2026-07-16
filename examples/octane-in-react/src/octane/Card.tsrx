// The `{props.children}` hole receives the React children bridged by the
// wrapper — React keeps owning them (state, context, events) while Octane
// renders the frame around them.
export function Card(props) @{
	<section class="card">
		<h3 class="card-title">
			{props.title as string}
		</h3>
		<div class="card-body">{props.children}</div>
	</section>
}
