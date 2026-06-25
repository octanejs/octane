// Mirrors the vite-plugin's SSR layout/page composition: a Layout renders its
// `{children}` hole, and `children` is a ComponentBody that re-invokes the page
// with its real `{ params }` props. octane's childSlot calls a function child
// PROPS-FIRST as `({}, block, extra)`, so the closure must pass the page's props
// explicitly and thread the scope.

export function ChildPage(props) @{
	<span>
		{props.params.id as string}
	</span>
}

export function ParentLayout(props) @{
	<div>{props.children}</div>
}
