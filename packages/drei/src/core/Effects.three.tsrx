/** @jsxImportSource @octanejs/three/intrinsics */
import {
	extend,
	type ThreeElement,
	type ThreeRef,
	useFrame,
	useThree,
} from '@octanejs/three';
import { useEffect, useMemo, useRef, useState } from '@octanejs/three/renderer';
import * as THREE from 'three';
import {
	EffectComposer,
	GammaCorrectionShader,
	RenderPass,
	ShaderPass,
} from 'three-stdlib';

const EffectComposerElement = extend(EffectComposer);
const RenderPassElement = extend(RenderPass);
const ShaderPassElement = extend(ShaderPass);

export type EffectsProps = Omit<ThreeElement<typeof EffectComposer>, 'ref' | 'args'> & {
	multisamping?: number;
	colorSpace?: THREE.ColorSpace;
	type?: THREE.TextureDataType;
	renderIndex?: number;
	disableGamma?: boolean;
	disableRenderPass?: boolean;
	disableRender?: boolean;
	depthBuffer?: boolean;
	stencilBuffer?: boolean;
	anisotropy?: number;
};

function assignRef<T>(ref: ThreeRef<T> | undefined, value: T | null): void {
	if (Array.isArray(ref)) for (const item of ref) assignRef(item, value);
	else if (typeof ref === 'function') ref(value);
	else if (ref && 'current' in ref) ref.current = value;
}

function appendPasses(passes: any[], children: any): void {
	if (Array.isArray(children)) {
		for (const child of children) appendPasses(passes, child);
		return;
	}
	if (children == null || typeof children === 'boolean') return;
	const key = passes.length;
	passes.push({
		...children,
		key: String(key),
		props: { ...children.props, key, attach: `passes-${key}` },
	});
}

export function Effects({
	children,
	multisamping = 8,
	renderIndex = 1,
	disableRender,
	disableGamma,
	disableRenderPass,
	depthBuffer = true,
	stencilBuffer = false,
	anisotropy = 1,
	colorSpace,
	type,
	ref,
	...props
}: EffectsProps & { ref?: ThreeRef<EffectComposer> }) @{
	const composer = useRef<EffectComposer | null>(null);
	const mergedRef = useMemo(
		() => (value: EffectComposer | null) => {
			composer.current = value;
			assignRef(ref, value);
		},
		[ref],
	);
	const { scene, camera, gl, size, viewport } = useThree();
	const [target] = useState(() => {
		const renderTarget = new THREE.WebGLRenderTarget(size.width, size.height, {
			type: type || THREE.HalfFloatType,
			format: THREE.RGBAFormat,
			depthBuffer,
			stencilBuffer,
			anisotropy,
		});
		if (type === THREE.UnsignedByteType && colorSpace != null) {
			renderTarget.texture.colorSpace = colorSpace;
		}
		renderTarget.samples = multisamping;
		return renderTarget;
	});
	useEffect(() => {
		composer.current?.setSize(size.width, size.height);
		composer.current?.setPixelRatio(viewport.dpr);
	}, [gl, size, viewport.dpr]);
	useFrame(() => {
		if (!disableRender) composer.current?.render();
	}, renderIndex);
	const passes: any[] = [];
	if (!disableRenderPass) {
		passes.push(<RenderPassElement key="renderpass" attach={`passes-${passes.length}`} args={[scene, camera] as any} />);
	}
	if (!disableGamma) {
		passes.push(<ShaderPassElement key="gammapass" attach={`passes-${passes.length}`} args={[GammaCorrectionShader]} />);
	}
	appendPasses(passes, children);
	<EffectComposerElement
		ref={mergedRef}
		args={[gl as any, target]}
		__octaneAutoAttachArray="passes"
		{...props as any}
	>
		{passes}
	</EffectComposerElement>
}
