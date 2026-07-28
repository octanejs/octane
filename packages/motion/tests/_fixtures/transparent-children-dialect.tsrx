import { createElement, useState, type ComponentBody, type OctaneNode } from 'octane';
import { AnimatePresence } from '@octanejs/motion';

interface PassthroughProps {
	children?: OctaneNode | ComponentBody;
}

function Passthrough(props: PassthroughProps) {
	return props.children ?? null;
}

interface DialectRootProps extends PassthroughProps {
	wrapped: boolean;
}

function DialectRoot(props: DialectRootProps) {
	return createElement(AnimatePresence, {
		children: props.wrapped
			? createElement(Passthrough, { children: props.children })
			: props.children,
	});
}

function Counter() @{
	const [count, setCount, getCount] = useState(0);
	<button class="count" onClick={() => setCount(getCount() + 1)}>{'count:' + count}</button>
}

export function AnimatePresenceChildrenDialectFlip() @{
	const [wrapped, setWrapped, getWrapped] = useState(false);
	<div>
		<button class="toggle" onClick={() => setWrapped(!getWrapped())}>toggle wrapper</button>
		<DialectRoot wrapped={wrapped}>
			<Counter />
		</DialectRoot>
	</div>
}
