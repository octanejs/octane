// Directive-form (.tsrx) counterparts — regression guards (these already work).

export function SpreadProp(props) @{
	<div {...props.attrs} data-testid="sp">{props.label as string}</div>
}

const A = { 'data-z': 'z' };
export function SpreadLocal() @{
	<div {...A} data-testid="sl" />
}

export function CommentMixed() @{
	<div data-testid="cm">
		{/* hello */}
		<span class="y">hi</span>
	</div>
}

export function CommentOnly() @{
	<div data-testid="co">
		{/* nothing here */}
	</div>
}
