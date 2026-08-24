import type { OctaneNode } from 'octane';
import type { Octane } from 'octane/jsx-runtime';

export type PanelSize = { asPercentage: number; inPixels: number };
export type GroupResizeBehavior = 'preserve-relative-size' | 'preserve-pixel-size';
export type SizeUnit = 'px' | '%' | 'em' | 'rem' | 'vh' | 'vw';
export type PanelConstraintProps = {
	collapsedSize?: number | string;
	collapsible?: boolean;
	defaultSize?: number | string;
	disabled?: boolean;
	groupResizeBehavior?: GroupResizeBehavior;
	maxSize?: number | string;
	minSize?: number | string;
};
export type PanelConstraints = {
	collapsedSize: number;
	collapsible: boolean;
	defaultSize: number | undefined;
	disabled: boolean | undefined;
	groupResizeBehavior?: GroupResizeBehavior;
	maxSize: number;
	minSize: number;
	panelId: string;
};
type PanelResizeCallback = (
	size: PanelSize,
	id: string | number | undefined,
	previousSize: PanelSize | undefined,
) => void;
export type RegisteredPanel = {
	id: string;
	idIsStable: boolean;
	element: HTMLDivElement;
	mutableValues: { expandToSize: number | undefined; prevSize: PanelSize | undefined };
	onResize: PanelResizeCallback | undefined;
	panelConstraints: PanelConstraintProps;
};
export interface PanelImperativeHandle {
	collapse(): void;
	expand(): void;
	getSize(): PanelSize;
	isCollapsed(): boolean;
	resize(size: number | string): void;
}
type DivStyle = Exclude<Octane.JSX.IntrinsicElements['div']['style'], string | undefined>;
type DivProps = Omit<
	Octane.JSX.IntrinsicElements['div'],
	'children' | 'id' | 'ref' | 'onResize' | 'style'
>;
export type PanelProps = DivProps & {
	children?: OctaneNode;
	collapsedSize?: number | string;
	collapsible?: boolean;
	defaultSize?: number | string;
	disabled?: boolean;
	elementRef?: Octane.Ref<HTMLDivElement | null>;
	groupResizeBehavior?: GroupResizeBehavior;
	id?: string | number;
	maxSize?: number | string;
	minSize?: number | string;
	onResize?: PanelResizeCallback;
	panelRef?: Octane.Ref<PanelImperativeHandle | null>;
	style?: DivStyle;
};
export type OnPanelResize = PanelProps['onResize'];
