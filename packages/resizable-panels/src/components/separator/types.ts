import type { CSSProperties as DivStyle, OctaneNode } from 'octane';
import type { Octane } from 'octane/jsx-runtime';

type DivProps = Omit<
	Octane.JSX.IntrinsicElements['div'],
	'children' | 'id' | 'ref' | 'role' | 'tabIndex' | 'style'
>;
export type SeparatorProps = DivProps & {
	children?: OctaneNode;
	disabled?: boolean;
	disableDoubleClick?: boolean;
	elementRef?: Octane.Ref<HTMLDivElement | null>;
	id?: string | number;
	style?: DivStyle;
};
export type RegisteredSeparator = {
	disabled?: boolean;
	disableDoubleClick?: boolean;
	element: HTMLDivElement;
	id: string;
};
