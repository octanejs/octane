/** @jsxImportSource @octanejs/three/intrinsics */
import type { ThreeRef } from '@octanejs/three';
import { FaceControls, type FaceControlsApi, type FaceControlsProps, useFaceControls } from '../../src/web/FaceControls.three.tsrx';

function ContextReader({ onContext }: { onContext?: (api: FaceControlsApi) => void }) @{
	onContext?.(useFaceControls());
}

export function FaceControlsScene({ controlsRef, onContext, ...props }: FaceControlsProps & { controlsRef?: ThreeRef<FaceControlsApi>; onContext?: (api: FaceControlsApi) => void }) @{
	<FaceControls {...props} facemesh={{ ...props.facemesh, children: <><meshNormalMaterial /><ContextReader onContext={onContext} /></> }} ref={controlsRef} />
}
