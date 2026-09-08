import {
	Button,
	composeRenderProps,
	ToggleButton,
	UNSTABLE_ToastQueue,
	UNSTABLE_ToastRegion,
} from '@octanejs/aria/components';

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

// ToastRegion has its own children dispatch because a plain function child is
// shorthand for rendering each queued toast. A .tsrx block child must bypass
// that render-prop path just like the shared RAC render-props plumbing does.
export function BlockChildrenToastRegion(props: { queue: UNSTABLE_ToastQueue<string> }) @{
	<UNSTABLE_ToastRegion queue={props.queue}>
		<span id="block-toast-child">Queued notifications</span>
	</UNSTABLE_ToastRegion>
}
