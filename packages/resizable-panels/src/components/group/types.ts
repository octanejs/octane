import type { OctaneNode } from 'octane';
import type { Octane } from 'octane/jsx-runtime';
import type { RegisteredPanel } from '../panel/types';
import type { RegisteredSeparator } from '../separator/types';

export type Orientation = 'horizontal' | 'vertical';
export type Layout = Record<string, number>;
export type LayoutStorage = Pick<Storage, 'getItem' | 'setItem'>;
export type LayoutChangedMeta = { isUserInteraction: boolean };
export type ResizeTargetMinimumSize = { coarse: number; fine: number };
export type RegisteredGroup = Readonly<{
	disabled: boolean;
	element: HTMLElement;
	id: string;
	mutableState: {
		defaultLayout: Readonly<Layout> | undefined;
		disableCursor: boolean;
		expandedPanelSizes: Record<string, number>;
		layouts: Record<string, Layout>;
	};
	orientation: Orientation;
	panels: RegisteredPanel[];
	resizeTargetMinimumSize: ResizeTargetMinimumSize;
	separators: RegisteredSeparator[];
}>;

export interface GroupImperativeHandle {
	getLayout(): Layout;
	setLayout(layout: Layout): Layout;
}

type DivStyle = Exclude<Octane.JSX.IntrinsicElements['div']['style'], string | undefined>;
type DivProps = Omit<Octane.JSX.IntrinsicElements['div'], 'children' | 'id' | 'ref' | 'style'>;
export type GroupProps = DivProps & {
	children?: OctaneNode;
	defaultLayout?: Layout;
	disableCursor?: boolean;
	disabled?: boolean;
	elementRef?: Octane.Ref<HTMLDivElement | null>;
	groupRef?: Octane.Ref<GroupImperativeHandle | null>;
	id?: string | number;
	onLayoutChange?: (layout: Layout) => void;
	onLayoutChanged?: (layout: Layout, meta: LayoutChangedMeta) => void;
	orientation?: Orientation;
	resizeTargetMinimumSize?: ResizeTargetMinimumSize;
	style?: DivStyle;
};

export type OnGroupLayoutChange = GroupProps['onLayoutChange'];
export type OnGroupLayoutChanged = GroupProps['onLayoutChanged'];
