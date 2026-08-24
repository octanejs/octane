import * as Boneyard from '@octanejs/boneyard';
import {
	BoneSuspense,
	Skeleton,
	configureBoneyard,
	getBoneyardConfig,
	getRegisteredSkeleton,
	normalizeBone,
	registerBones,
	registerSkeleton,
	registerSkeletons,
	renderBones,
	selectBreakpoint,
	snapshotBones,
} from '@octanejs/boneyard';

declare function expectType<T>(value: T): void;

Boneyard satisfies object;
expectType<Function>(BoneSuspense);
expectType<Function>(Skeleton);
expectType<Function>(configureBoneyard);
expectType<Function>(getBoneyardConfig);
expectType<Function>(getRegisteredSkeleton);
expectType<Function>(normalizeBone);
expectType<Function>(registerBones);
expectType<Function>(registerSkeleton);
expectType<Function>(registerSkeletons);
expectType<Function>(renderBones);
expectType<Function>(selectBreakpoint);
expectType<Function>(snapshotBones);

// @ts-expect-error a binding function is not a number
const invalidExport: number = Skeleton;
void invalidExport;
