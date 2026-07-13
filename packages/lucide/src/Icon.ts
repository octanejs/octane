import { createElement } from 'octane';
import { useLucideContext } from './context';
import defaultAttributes from './defaultAttributes';
import { hasA11yProp, mergeClasses } from './shared';
import type { IconNode, LucideProps } from './types';

export interface IconComponentProps extends LucideProps {
	iconNode: IconNode;
}

export function Icon(props: IconComponentProps) {
	const {
		color,
		size,
		strokeWidth,
		absoluteStrokeWidth,
		className = '',
		children,
		iconNode,
		ref,
		...rest
	} = props;
	const {
		size: contextSize = 24,
		strokeWidth: contextStrokeWidth = 2,
		absoluteStrokeWidth: contextAbsoluteStrokeWidth = false,
		color: contextColor = 'currentColor',
		className: contextClass = '',
	} = useLucideContext() ?? {};
	const calculatedStrokeWidth =
		(absoluteStrokeWidth ?? contextAbsoluteStrokeWidth)
			? (Number(strokeWidth ?? contextStrokeWidth) * 24) / Number(size ?? contextSize)
			: (strokeWidth ?? contextStrokeWidth);

	return createElement('svg', {
		ref,
		...defaultAttributes,
		width: size ?? contextSize ?? defaultAttributes.width,
		height: size ?? contextSize ?? defaultAttributes.height,
		stroke: color ?? contextColor,
		strokeWidth: calculatedStrokeWidth,
		className: mergeClasses('lucide', contextClass as string, className as string),
		...(!children && !hasA11yProp(rest) ? { 'aria-hidden': 'true' } : {}),
		...rest,
		children: [
			...iconNode.map(([tag, attrs]) => createElement(tag, attrs)),
			...(Array.isArray(children) ? children : [children]),
		],
	});
}

export default Icon;
