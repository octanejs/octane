import { createElement, type OctaneNode } from 'octane';

function Neighbor() @{
	<i>before</i>
}

function DescriptorHost(props: { children?: OctaneNode; siblings: boolean }) {
	return props.siblings
		? createElement(
				'section',
				{ id: 'descriptor-host' },
				createElement(Neighbor),
				props.children,
				createElement('i', null, 'after'),
			)
		: createElement('section', { id: 'descriptor-host' }, props.children);
}

export function FunctionChildrenHost(props: {
	siblings: boolean;
	label: string;
	ref: { current: HTMLButtonElement | null };
	onClick(): void;
}) @{
	<DescriptorHost siblings={props.siblings}>
		<button
			id="function-child"
			ref={props.ref}
			onClick={props.onClick}
		>{props.label as string}</button>
	</DescriptorHost>
}
