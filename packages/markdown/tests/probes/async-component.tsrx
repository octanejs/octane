import { createElement, type OctaneNode } from 'octane';

export type AsyncMappedComponent<Props> = (props: Props) => OctaneNode | Promise<OctaneNode>;

export interface AsyncMappedProps {
	children?: OctaneNode;
	label: string;
	reject?: boolean;
}

export async function AsyncMapped(props: AsyncMappedProps): Promise<OctaneNode> {
	await Promise.resolve();
	if (props.reject) throw new Error(`mapped:${props.label}`);
	return createElement('strong', { 'data-label': props.label }, props.children);
}

export function AsyncProjectionProbe(props: {
	component: AsyncMappedComponent<AsyncMappedProps>;
	label: string;
	reject?: boolean;
}) @{
	<section id="async-projection">{createElement(props.component, {
		label: props.label,
		reject: props.reject,
		children: createElement('em', null, 'nested'),
	})}</section>
}
