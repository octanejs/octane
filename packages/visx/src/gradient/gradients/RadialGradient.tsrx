import type { SVGProps } from 'react';
import type { LinearGradientProps } from './LinearGradient.tsrx';
import useStableId from '../../kernel/ids/useStableId.tsrx';

export type RadialGradientProps =
	Pick<LinearGradientProps, | 'id'
	| 'from'
	| 'to'
	| 'fromOffset'
	| 'fromOpacity'
	| 'toOffset'
	| 'toOpacity'
	| 'rotate'
	| 'transform'
	| 'children'> & SVGProps<SVGRadialGradientElement>; // passed as rest props to radialGradient

export default function RadialGradient({
	children,
	id,
	from,
	to,
	fromOffset = '0%',
	fromOpacity = 1,
	toOffset = '100%',
	toOpacity = 1,
	rotate,
	transform,
	...restProps
}: RadialGradientProps) {
	const generatedId = useStableId('visx-gradient');
	const gradientId = id ?? generatedId;
	return <defs>
		<radialGradient
			id={gradientId}
			gradientTransform={rotate ? `rotate(${rotate})` : transform}
			{...restProps}
		>
			{!!children && children}
			{!children && <stop offset={fromOffset} stopColor={from} stopOpacity={fromOpacity} />}
			{!children && <stop offset={toOffset} stopColor={to} stopOpacity={toOpacity} />}
		</radialGradient>
	</defs>;
}
