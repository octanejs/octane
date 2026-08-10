/** @jsxImportSource @octanejs/three/intrinsics */
import type { ThreeRef } from '@octanejs/three';
import * as THREE from 'three';
import { View, type ViewProps } from '../../src/web/View.three.tsrx';

export function ViewScene({ viewRef, ...props }: ViewProps & { viewRef?: ThreeRef<THREE.Group> }) @{
	<View {...props} ref={viewRef}><mesh name="view-child" /></View>
}

export function ViewPortScene() @{
	<View.Port />
}
