export function createMotionPath(path: TargetsParam, offset?: number): {
    translateX: FunctionValue;
    translateY: FunctionValue;
    rotate: FunctionValue;
};
import type { TargetsParam } from '../types/index.js';
import type { FunctionValue } from '../types/index.js';
