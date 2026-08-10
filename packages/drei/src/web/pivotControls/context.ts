import { createContext } from '@octanejs/three/renderer';
import type { Matrix4, Vector3 } from 'three';

export type OnDragStartProps = {
	component: 'Arrow' | 'Slider' | 'Rotator' | 'Sphere';
	axis: 0 | 1 | 2;
	origin: Vector3;
	directions: Vector3[];
};

export type Limits = [
	[number, number] | undefined,
	[number, number] | undefined,
	[number, number] | undefined,
];

export type PivotContext = {
	onDragStart: (props: OnDragStartProps) => void;
	onDrag: (matrix: Matrix4) => void;
	onDragEnd: () => void;
	translation: { current: [number, number, number] };
	translationLimits?: Limits;
	rotationLimits?: Limits;
	scaleLimits?: Limits;
	axisColors: [string | number, string | number, string | number];
	hoveredColor: string | number;
	opacity: number;
	scale: number;
	lineWidth: number;
	fixed: boolean;
	depthTest: boolean;
	renderOrder: number;
	userData?: Record<string, any>;
	annotations?: boolean;
	annotationsClass?: string;
};

export const context = createContext<PivotContext>(null!);
