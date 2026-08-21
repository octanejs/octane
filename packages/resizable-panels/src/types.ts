export type Dimensions = { height: number; width: number };
export type Point = { x: number; y: number };
export type PointerPrecision = { coarse: number; precise: number };
export type Rect = Dimensions & Point;

export type {
	Layout,
	LayoutChangedMeta,
	LayoutStorage,
	Orientation,
} from './components/group/types';
export type {
	GroupResizeBehavior,
	PanelConstraints,
	PanelImperativeHandle,
	PanelSize,
	SizeUnit,
} from './components/panel/types';
