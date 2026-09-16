import { buildLucideIconNode } from '@lucide/icons/build';
import { createElement, type ElementDescriptor } from 'octane';
import { useLucideContext } from './context';
import { hasA11yProp, mergeClasses } from './shared';
import type { IconNode, LucideIconData, LucideIconNode, LucideProps } from './types';

export type IconComponentProps = LucideProps &
	({ icon: LucideIconData; iconNode?: never } | { icon?: never; iconNode: IconNode });

function renderNode([tag, attributes, children]: LucideIconNode): ElementDescriptor {
	return createElement(tag, { ...attributes, children: children?.map(renderNode) });
}

export function Icon(props: IconComponentProps) {
	const {
		icon,
		iconNode = [],
		size,
		width,
		height,
		color,
		strokeWidth,
		absoluteStrokeWidth,
		nonScalingStroke,
		className,
		children,
		ref,
		...attributes
	} = props;
	const context = useLucideContext();
	const [tag, svgAttributes, nodes] = buildLucideIconNode(icon ?? { node: iconNode }, {
		width: width ?? size ?? context.size ?? 24,
		height: height ?? size ?? context.size ?? 24,
		color: color ?? context.color,
		strokeWidth: strokeWidth ?? context.strokeWidth,
		absoluteStrokeWidth: absoluteStrokeWidth ?? context.absoluteStrokeWidth,
		nonScalingStroke: nonScalingStroke ?? context.nonScalingStroke,
		className: mergeClasses(context.className, className),
		hasA11yProp: Boolean(children) || hasA11yProp(attributes),
		attributeNames: { class: 'className' },
		attributes,
	});

	return createElement(tag, {
		...svgAttributes,
		ref,
		children: [
			...(nodes?.map(renderNode) ?? []),
			...(Array.isArray(children) ? children : [children]),
		],
	});
}

export default Icon;
