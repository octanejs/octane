import type { Octane } from 'octane/jsx-runtime';
import type { OctaneNode } from 'octane';
import useStableId from '../../kernel/ids/useStableId.tsrx';

export type ClipPathProps = {
	/** Unique id for the clipPath. */
	id?: string;
	/** clipPath children. */
	children?: OctaneNode;
};

/** Handles rendering of <defs> and <clipPath> elements for you, with any children you want. */
export default function ClipPath({
	id,
	children,
	...restProps
}: ClipPathProps & Omit<Octane.SVGProps<SVGClipPathElement>, keyof ClipPathProps>) {
	const generatedId = useStableId('visx-clip');
	return <defs>
		<clipPath id={id ?? generatedId} {...restProps}>{children}</clipPath>
	</defs>;
}
