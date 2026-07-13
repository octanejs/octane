// Value-position JSX under SSR: React-style render-prop children that return JSX
// (`<Comp>{(data) => <span>{data as string}</span>}</Comp>`) and the closely
// related `{xs.map(x => <li>{x as string}</li>)}` case. Both lower their JSX to
// `createElement(...)` descriptors (host tag → string type), which `ssrChild`
// renders server-side and the client de-opt path rebuilds on hydration.

// A render-prop consumer: it CALLS its children function with data and renders
// whatever descriptor comes back.
export function RenderProp(props) @{
	<div id="rp">{props.children('DATA')}</div>
}

// Render-prop child returns a HOST element with attrs + a nested text hole.
export function HostProp() @{
	<RenderProp>
		{(data) => <span class="lbl" data-k="v">
			{data as string}
		</span>}
	</RenderProp>
}

// Render-prop child returns a FRAGMENT (`<>…</>`) → an array of host descriptors.
export function FragProp() @{
	<RenderProp>
		{(data) => <>
			<b>
				{data as string}
			</b>
			<i>!</i>
		</>}
	</RenderProp>
}

// `{xs.map(x => <li/>)}` at child position → an array of host descriptors.
export function MapList(props) @{
	<ul id="ml">{props.items.map(
		(x) => <li class="row">
			{x as string}
		</li>,
	)}</ul>
}

// A return-based nested component with empty output. Its server component
// range is adjacent (`<!--[--><!--]-->`) and hydration must not insert a
// client-only empty anchor inside it.
export const ReturnNullChild = () => null;

export function ReturnNullParent() @{
	<section id="empty-return">
		<ReturnNullChild />
		<span id="after-empty">after</span>
	</section>
}

function ReturnMaybeChild(props) {
	if (!props.show) return null;
	return <em id="return-filled">filled</em>;
}

export function ReturnMaybeParent(props) @{
	<section id="maybe-return">
		<ReturnMaybeChild show={props.show} />
		<span id="after-maybe">after</span>
	</section>
}
