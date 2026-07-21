// ---------------------------------------------------------------------------
// Top-level control-flow constructs in MULTI-ROOT bodies (fragment roots), and
// control-flow-ONLY bodies mounted next to later siblings. Regression pins for
// the planJsx top-level loop:
//   - a construct between static roots must render at its source position
//     (via its `<!>` anchor), not append at the end of the block;
//   - `htmlIdx` must only advance for nodes that actually contribute template
//     HTML, so a BOUND static sibling placed AFTER a construct still resolves
//     the right template path (this used to crash the mount walk);
//   - a component whose body is ONLY a @for/@try/@switch anchors its content
//     at `__block.endMarker`, so it stays INSIDE the component's range instead
//     of rendering after later siblings (the ifBlock fallback, generalized).
// ---------------------------------------------------------------------------

export function MixedRootsIf(props) @{
	<>
		<p id="before">{'before'}</p>
		@if (props.show) {
			<span id="cond">{'cond'}</span>
		}
		<p id="after" class={props.cls}>{props.label as string}</p>
	</>
}

export function MixedRootsFor(props) @{
	<>
		<h2 id="head">{'head'}</h2>
		@for (const x of props.items; key x) {
			<li class="item">{x as string}</li>
		}
		<footer id="foot">{props.note as string}</footer>
	</>
}

// Body is ONLY a @for — a control-flow-only (bagless) body.
function RowsOnly(props) @{
	<>
		@for (const x of props.items; key x) {
			<li class="row">{x as string}</li>
		}
	</>
}

export function ForOnlyWithSibling(props) @{
	<ul>
		<RowsOnly items={props.items} />
		<li id="tail">{'tail'}</li>
	</ul>
}

// Body is ONLY a @try.
function TryOnly(props) @{
	<>
		@try {
			<em class="tried">{props.label as string}</em>
		} @catch (e) {
			<em class="failed">{'failed'}</em>
		}
	</>
}

export function TryOnlyWithSibling(props) @{
	<div>
		<TryOnly label={props.label} />
		<span id="try-tail">{'after-try'}</span>
	</div>
}

// Body is ONLY a @switch.
function SwitchOnly(props) @{
	<>
		@switch (props.mode) {
			@case 'a': {
				<b class="mode">{'A'}</b>
			}
			@default: {
				<b class="mode">{'D'}</b>
			}
		}
	</>
}

export function SwitchOnlyWithSibling(props) @{
	<div>
		<SwitchOnly mode={props.mode} />
		<span id="switch-tail">{'after-switch'}</span>
	</div>
}
