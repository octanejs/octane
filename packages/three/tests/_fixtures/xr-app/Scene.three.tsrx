import { useFrame } from '@octanejs/three';

interface XRProof {
	frameTags: string[];
}

export function Scene() @{
	useFrame((_state, _delta, frame) => {
		const proof = (globalThis as typeof globalThis & { __octaneThreeXR: XRProof }).__octaneThreeXR;
		proof.frameTags.push((frame as XRFrame & { tag?: string } | undefined)?.tag ?? 'missing');
	});
	<group name="xr-lifecycle-scene" />
}
