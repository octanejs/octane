import { Button, composeRenderProps, ToggleButton } from '@octanejs/aria/components';

// `@{ … }` is the idiomatic .tsrx body form, and it compiles component children
// to a tagged BLOCK FUNCTION rather than a plain value. RAC's render-props
// plumbing must pass such children through untouched instead of invoking them
// as a render prop.
export function BlockChildrenButton() @{
	<Button id="block-btn">Save</Button>
}

// The `return <jsx>` form emits children as an ordinary value — the shape
// upstream always sees. Both must render the same text.
export function ValueChildrenButton() {
	return <Button id="value-btn">Save</Button>;
}

// A genuine RAC render prop must still be CALLED: it is not a children block.
export function RenderPropButton() @{
	<ToggleButton id="render-prop" defaultSelected>
		{(values: { isSelected: boolean }) => (values.isSelected ? 'on' : 'off')}
	</ToggleButton>
}

// The shape shadcn's React Aria base uses everywhere: a wrapper takes the
// caller's children and hands them to composeRenderProps so it can wrap its own
// markup around them. With `@{ … }` authoring those children are a tagged block
// function, and composeRenderProps must forward them rather than call them.
function ComposedButton(props: { children?: unknown }) @{
	<Button id="composed">{composeRenderProps(
		props.children as any,
		(children: unknown) => <>
			<span data-slot="indicator">[x]</span>
			{children}
		</>,
	)}</Button>
}

export function ComposedBlockChildren() @{
	<ComposedButton>Accept terms</ComposedButton>
}
