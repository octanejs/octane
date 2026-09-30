// A textarea's `children` prop is a live text binding in Octane whether it is
// authored as JSX children, held by a spread, or written as `children=`. It
// owns the textarea's default value on every commit, not only the first.

export function ChildrenProp(props: { value: any }) @{
	<section>
		<textarea {...{ children: props.value }} />
	</section>
}

export function SpreadChildren(props: { rest: Record<string, unknown> }) @{
	<section>
		<textarea {...props.rest} />
	</section>
}

export function ChildrenAttrSpread(props: { value: any; rest: Record<string, unknown> }) @{
	<section>
		<textarea {...props.rest} children={props.value} />
	</section>
}

export function ChildrenAttr(props: { value: any }) @{
	<section>
		<textarea children={props.value} />
	</section>
}

// Both form writers resolve the host's props together, with or without a spread.
export function ChildrenAttrCascade(props: { value: any; control: any; fallback: any }) @{
	<section>
		<textarea children={props.value} value={props.control} defaultValue={props.fallback} />
	</section>
}
