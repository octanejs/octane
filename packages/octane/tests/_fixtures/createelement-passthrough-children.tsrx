// Mirrors @octanejs/tanstack-router's server-side Body: a component that
// re-parents its compiled CHILDREN BLOCK through createElement positional
// children into a bare-children-return passthrough component.
import { createElement, HYDRATION_RANGE_BOUNDARY } from 'octane';

const Owner = (props: any) => props.children;
(Owner as any)[HYDRATION_RANGE_BOUNDARY] = 'owner';

const Body = (props: any) => {
	const { children, ...attrs } = props;
	return createElement(
		'body',
		attrs,
		createElement('div', { id: '__app' }, createElement(Owner, {}, children)),
	);
};

export function App() {
	return <Body class="overflow-x-hidden">
		<div data-probe="static">static child</div>
		<p>{'text' as string}</p>
	</Body>;
}
