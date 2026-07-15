import type { ReactNode } from 'react';
import useStableId from '../../kernel/ids/useStableId.tsrx';

export type PatternProps = {
	/** Unique id of the pattern element. */
	id?: string;
	/** Width of the pattern. */
	width: number;
	/** Height of the pattern. */
	height: number;
	/** Children of pattern element to render. */
	children: ReactNode;
};

export default function Pattern({ id, width, height, children }: PatternProps) {
	const generatedId = useStableId('visx-pattern');
	return <defs>
		<pattern
			id={id ?? generatedId}
			width={width}
			height={height}
			patternUnits="userSpaceOnUse"
		>{children}</pattern>
	</defs>;
}
