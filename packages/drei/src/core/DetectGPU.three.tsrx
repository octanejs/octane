/** @jsxImportSource @octanejs/three/intrinsics */
import { use } from '@octanejs/three/renderer';
import { getGPUTier, type GetGPUTier } from 'detect-gpu';
import { slotDefault } from './compiler-slot.js';
import { resolveRenderChildren, type RenderChildren } from './octane-children.js';
import { resourcePromise } from './resource.js';

export const useDetectGPU = (props?: GetGPUTier) => {
	props = slotDefault(props, undefined);
	return use(resourcePromise(() => getGPUTier(props), ['useDetectGPU']));
};

export type DetectGPUProps = {
	children?: RenderChildren<ReturnType<typeof useDetectGPU>>;
} & Parameters<typeof useDetectGPU>[0];

export function DetectGPU({ children, ...options }: DetectGPUProps) @{
	const result = useDetectGPU(options);
	<>
		{resolveRenderChildren(children, result)}
	</>
}
