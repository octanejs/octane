import * as Boneyard from 'boneyard-js';
import {
	compileDescriptor,
	computeLayout,
	extractResponsive,
	fromElement,
	invalidateDescriptor,
	normalizeBone,
	registerBones,
	renderBones,
	skeleton,
	snapshotBones,
} from 'boneyard-js';

declare function expectType<T>(value: T): void;

Boneyard satisfies object;
expectType<Function>(compileDescriptor);
expectType<Function>(computeLayout);
expectType<Function>(extractResponsive);
expectType<Function>(fromElement);
expectType<Function>(invalidateDescriptor);
expectType<Function>(normalizeBone);
expectType<Function>(registerBones);
expectType<Function>(renderBones);
expectType<Function>(skeleton);
expectType<Function>(snapshotBones);

// @ts-expect-error an upstream function is not a number
const invalidExport: number = registerBones;
void invalidExport;
