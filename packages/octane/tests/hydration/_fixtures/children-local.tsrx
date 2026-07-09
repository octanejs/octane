import { isChildrenBlock } from 'octane';

// Children forwarded through a LOCAL const (with a render-prop check) before
// rendering — the @octanejs/tanstack-router Link shape. The SSR emitter must render the
// children block as MARKUP here exactly like a direct `{props.children}` hole
// (regression: it HTML-escaped the child's serialized markup into a text node
// and the client saw text where it expected the <img>).
export function LocalWrap(props) @{
	const resolved =
		typeof props.children === 'function' && !isChildrenBlock(props.children)
			? props.children({ isActive: false })
			: props.children;
	<a class="w">{resolved}</a>
}

// The direct-hole control.
export function DirectWrap(props) @{
	<a class="w">{props.children}</a>
}

export function AppLocal(props) @{
	<div id="root">
		<LocalWrap>
			<img src={props.url} alt="Octane" class="wordmark-img" />
		</LocalWrap>
	</div>
}

export function AppDirect(props) @{
	<div id="root">
		<DirectWrap>
			<img src={props.url} alt="Octane" class="wordmark-img" />
		</DirectWrap>
	</div>
}
