import { Children, cloneElement, isValidElement, type OctaneNode } from 'octane';
import type { Octane } from 'octane/jsx-runtime';

type CSSProperties = Exclude<NonNullable<Octane.HTMLAttributes<Element>['style']>, string>;
type DivProps = Octane.JSX.IntrinsicElements['div'];

type FlexProps =
	Omit<DivProps, 'children' | 'style'> & {
		// biome-ignore lint/suspicious/noExplicitAny: Too complex to type
		children: OctaneNode[];
		className?: string;
		count: number;
		direction?: 'row' | 'column';
		offset?: number;
		style?: CSSProperties;
		wrap?: boolean;
	};

function toPercent(num: number): string {
	return `${num}%`;
}

export default function Flex({
	children,
	className,
	count,
	direction,
	offset,
	style,
	wrap,
	...otherProps
}: FlexProps): OctaneNode {
	const clonedChildren = Children.toArray(children).filter(isValidElement).map((child, index) => {
		const marginInlineStart =
			offset && index === 0 ? toPercent((100 * offset) / count) : null;

		return cloneElement(child, {
			style: {
				flexBasis: toPercent(100 / count),
				flexShrink: 0,
				flexGrow: 0,
				overflow: 'hidden',
				marginLeft: marginInlineStart,
				marginInlineStart,
				marginInlineEnd: 0,
			},
		});
	});

	return <div
		className={className}
		style={{
			display: 'flex',
			flexDirection: direction,
			flexWrap: wrap ? 'wrap' : 'nowrap',
			...style,
		}}
		{...otherProps}
	>{clonedChildren}</div>;
}
