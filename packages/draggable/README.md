# @octanejs/draggable

An Octane port of the public `react-draggable@4.7.1` API. It preserves the
default `Draggable` component, named `DraggableCore`, controlled and
uncontrolled positioning, bounds, grids, axis restrictions, mouse and touch
gestures, and the upstream public TypeScript surface without a React runtime.

## Installation

```sh
npm install @octanejs/draggable
pnpm add @octanejs/draggable
```

```tsrx
import Draggable from '@octanejs/draggable';
import { useRef } from 'octane';

export function MovableCard() @{
	const nodeRef = useRef<HTMLDivElement | null>(null);

	<Draggable
		nodeRef={nodeRef}
		bounds="parent"
		grid={[10, 10]}
		defaultPosition={{ x: 20, y: 20 }}
	>
		<div ref={nodeRef} class="card">Drag me</div>
	</Draggable>
}
```

Pass the same `nodeRef` to `Draggable` and its single host child. This is the
required React 19-compatible host-node boundary used to install drag listeners
without `findDOMNode`. As in the pinned upstream release, `Draggable` clones
exactly one child and overwrites that child's transform while retaining its
other props, classes, styles, and ref. Child mouse and touch drag handlers are
owned by the binding and replaced by the corresponding `Draggable` props.

`DraggableCore` provides the gesture state machine and callbacks without adding
position styles or drag classes.

The binding targets exactly `react-draggable@4.7.1`. See
[`UPSTREAM.md`](./UPSTREAM.md) for immutable source, package, license, and parity
evidence.
