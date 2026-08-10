import { useBoxProjectedEnv } from '../src/index.js';
import { Vector3 } from 'three';

useBoxProjectedEnv();
useBoxProjectedEnv([1, 2, 3], new Vector3(4, 5, 6));
const spread = useBoxProjectedEnv(new Vector3(), [10, 20, 30]);
spread.customProgramCacheKey().toUpperCase();
spread.ref.current?.dispose();

// @ts-expect-error position must be a Three-compatible Vector3 representation
useBoxProjectedEnv([1, 2]);
// @ts-expect-error size must be a Three-compatible Vector3 representation
useBoxProjectedEnv(undefined, 'large');
