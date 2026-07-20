// The canonical route-config module shape: a config object at the top of the
// module captures components declared BELOW it. Authored `function`
// declarations hoist, so this is valid JS — compiled output must preserve
// that instead of lowering to TDZ `const` bindings.
export const Registry = { component: Card, fallback: Empty };

function Card(props) @{
	<section class="card">
		<h2>{props.title}</h2>
		<Empty />
	</section>
}

function Empty() @{
	<p class="empty">nothing yet</p>
}
