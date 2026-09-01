# `@octanejs/popper`

Octane binding for the complete public contract of `react-popper@2.3.0`.

```bash
npm install @octanejs/popper @popperjs/core
pnpm add @octanejs/popper @popperjs/core
```

```tsrx
import { Manager, Popper, Reference } from '@octanejs/popper';

export function Tooltip() {
	return <Manager>
		<Reference>{({ ref }) => <button ref={ref}>Anchor</button>}</Reference>
		<Popper placement="top">
			{({ ref, style, placement, arrowProps }) => <div
				ref={ref}
				style={style}
				data-placement={placement}
			>
				Tooltip
				<div ref={arrowProps.ref} style={arrowProps.style} />
			</div>}
		</Popper>
	</Manager>;
}
```

`usePopper` is also available with the same reference, popper, options, state,
styles, attributes, update, and force-update contract as the React package.
