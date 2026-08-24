import type { OctaneNode } from 'octane';

export type CompactBone = readonly [
	x: number,
	y: number,
	width: number,
	height: number,
	radius: number | string,
	container?: true,
];

export interface Bone {
	x: number;
	y: number;
	width: number;
	height: number;
	radius: number | string;
	container?: boolean;
}

export type AnyBone = CompactBone | Bone | readonly number[];

export interface SkeletonResult {
	name?: string;
	viewportWidth?: number;
	width: number;
	height: number;
	bones: readonly AnyBone[];
}

export interface ResponsiveBones {
	breakpoints: Record<string, SkeletonResult>;
}

export type SkeletonData = SkeletonResult | ResponsiveBones;
export type AnimationStyle = 'pulse' | 'shimmer' | 'solid';

export interface SnapshotConfig {
	excludeSelectors?: readonly string[];
	excludeTags?: readonly string[];
	leafTags?: readonly string[];
	captureRoundedBorders?: boolean;
}

export interface BoneyardConfig {
	color?: string;
	darkColor?: string;
	animate?: AnimationStyle | boolean;
	shimmerColor?: string;
	darkShimmerColor?: string;
	speed?: string;
	shimmerAngle?: number;
	stagger?: number | boolean;
	transition?: number | boolean;
	boneClass?: string;
}

export interface SkeletonProps extends BoneyardConfig {
	loading: boolean;
	name?: string;
	initialBones?: SkeletonData;
	className?: string;
	fallback?: OctaneNode;
	fixture?: OctaneNode;
	snapshotConfig?: SnapshotConfig;
	children?: OctaneNode;
}

export type BoneSuspenseProps = Omit<SkeletonProps, 'loading'>;
