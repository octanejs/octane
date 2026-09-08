import type { OctaneNode } from 'octane';
import type { Octane } from 'octane/jsx-runtime';

type StrictDivIntrinsic = Octane.JSX.IntrinsicElements['div'];
export type DivAttributes = Omit<StrictDivIntrinsic, 'ref'>;
export type PublicNode = OctaneNode;
export type PublicRef<T> = T extends HTMLDivElement ? StrictDivIntrinsic['ref'] : never;
export type PublicStyle = NonNullable<DivAttributes['style']>;
export type SetStateAction<T> = T | ((previous: T) => T);
export type Dispatch<T> = (action: T) => void;
export type PublicComponentResult = OctaneNode;

export type ProposedProps = DivAttributes & {
	children?: PublicNode;
	elementRef?: PublicRef<HTMLDivElement>;
	style?: PublicStyle;
	onPointerDown?: (event: PointerEvent) => void;
};
