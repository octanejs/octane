// Single-source spread fast-path fixtures: named writers beside exactly one
// spread — the svg-dashboard tuple shape (`[!1,'class',v],[!1,'d',v],[!0,u]`)
// the resolve-skipping bail targets. Each host pairs with a `tick` sibling so
// a test can prove a real commit ran while the host received no writes.

export function FastPathSvgEdge(props) @{
	<section>
		<span id="edge-tick">{props.tick as string}</span>
		<svg>
			<path id="fp-edge" class={props.cls} d={props.d} style={props.style} {...props.attrs}></path>
		</svg>
	</section>
}

export function FastPathDiv(props) @{
	<section>
		<span id="div-tick">{props.tick as string}</span>
		<div id="fp-div" class={props.cls} {...props.attrs}></div>
	</section>
}

export function FastPathMulti(props) @{
	<section>
		<span id="multi-tick">{props.tick as string}</span>
		<div id="fp-multi" {...props.a} {...props.b}></div>
	</section>
}

export function FastPathInput(props) @{
	<section>
		<span id="in-tick">{props.tick as string}</span>
		<input id="fp-input" type="text" {...props.attrs} />
	</section>
}
