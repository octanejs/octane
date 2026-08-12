/** @jsxImportSource @octanejs/three/intrinsics */
import { type ThreeElements, type ThreeRef, useFrame, useThree } from '@octanejs/three';
import { useImperativeHandle, useMemo, useRef } from '@octanejs/three/renderer';
import * as THREE from 'three';
import { HorizontalBlurShader, VerticalBlurShader } from 'three-stdlib';

export type ContactShadowsProps = Omit<ThreeElements['group'], 'ref' | 'scale'> & {
	opacity?: number;
	width?: number;
	height?: number;
	blur?: number;
	near?: number;
	far?: number;
	smooth?: boolean;
	resolution?: number;
	frames?: number;
	scale?: number | [x: number, y: number];
	color?: THREE.ColorRepresentation;
	depthWrite?: boolean;
};

export function ContactShadows({
	scale = 10,
	frames = Infinity,
	opacity = 1,
	width: widthFactor = 1,
	height: heightFactor = 1,
	blur = 1,
	near = 0,
	far = 10,
	resolution = 512,
	smooth = true,
	color = '#000000',
	depthWrite = false,
	renderOrder,
	ref,
	...props
}: ContactShadowsProps & { ref?: ThreeRef<THREE.Group> }) @{
	const group = useRef<THREE.Group | null>(null);
	const scene = useThree((state) => state.scene);
	const gl = useThree((state) => state.gl);
	const shadowCamera = useRef<THREE.OrthographicCamera | null>(null);
	const width = widthFactor * (Array.isArray(scale) ? scale[0] : scale || 1);
	const height = heightFactor * (Array.isArray(scale) ? scale[1] : scale || 1);
	const resources = useMemo(() => {
		const renderTarget = new THREE.WebGLRenderTarget(resolution, resolution);
		const renderTargetBlur = new THREE.WebGLRenderTarget(resolution, resolution);
		renderTargetBlur.texture.generateMipmaps = renderTarget.texture.generateMipmaps = false;
		const planeGeometry = new THREE.PlaneGeometry(width, height).rotateX(Math.PI / 2);
		const blurPlane = new THREE.Mesh(planeGeometry);
		const depthMaterial = new THREE.MeshDepthMaterial();
		depthMaterial.depthTest = depthMaterial.depthWrite = false;
		depthMaterial.onBeforeCompile = (shader) => {
			shader.uniforms = { ...shader.uniforms, ucolor: { value: new THREE.Color(color) } };
			shader.fragmentShader = shader.fragmentShader.replace('void main() {', 'uniform vec3 ucolor;\nvoid main() {');
			shader.fragmentShader = shader.fragmentShader.replace(
				'vec4( vec3( 1.0 - fragCoordZ ), opacity );',
				'vec4( ucolor * fragCoordZ * 2.0, ( 1.0 - fragCoordZ ) * 1.0 );',
			);
		};
		const horizontalBlurMaterial = new THREE.ShaderMaterial(HorizontalBlurShader);
		const verticalBlurMaterial = new THREE.ShaderMaterial(VerticalBlurShader);
		verticalBlurMaterial.depthTest = horizontalBlurMaterial.depthTest = false;
		return { renderTarget, renderTargetBlur, planeGeometry, blurPlane, depthMaterial, horizontalBlurMaterial, verticalBlurMaterial };
	}, [resolution, width, height, scale, color]);
	const blurShadows = (amount: number) => {
		const { blurPlane, horizontalBlurMaterial, verticalBlurMaterial, renderTarget, renderTargetBlur } = resources;
		blurPlane.visible = true;
		blurPlane.material = horizontalBlurMaterial;
		horizontalBlurMaterial.uniforms.tDiffuse.value = renderTarget.texture;
		horizontalBlurMaterial.uniforms.h.value = amount / 256;
		gl.setRenderTarget(renderTargetBlur);
		gl.render(blurPlane as any, shadowCamera.current!);
		blurPlane.material = verticalBlurMaterial;
		verticalBlurMaterial.uniforms.tDiffuse.value = renderTargetBlur.texture;
		verticalBlurMaterial.uniforms.v.value = amount / 256;
		gl.setRenderTarget(renderTarget);
		gl.render(blurPlane as any, shadowCamera.current!);
		blurPlane.visible = false;
	};
	let count = 0;
	useFrame(() => {
		if (!shadowCamera.current || !group.current || (frames !== Infinity && count >= frames)) return;
		count++;
		const initialBackground = scene.background;
		const initialOverrideMaterial = scene.overrideMaterial;
		group.current.visible = false;
		scene.background = null;
		scene.overrideMaterial = resources.depthMaterial;
		gl.setRenderTarget(resources.renderTarget);
		gl.render(scene, shadowCamera.current);
		blurShadows(blur);
		if (smooth) blurShadows(blur * 0.4);
		gl.setRenderTarget(null);
		group.current.visible = true;
		scene.overrideMaterial = initialOverrideMaterial;
		scene.background = initialBackground;
	});
	useImperativeHandle((ref ?? null) as any, () => group.current!, []);
	<group rotation-x={Math.PI / 2} {...props} ref={group}>
		<mesh renderOrder={renderOrder} geometry={resources.planeGeometry as any} scale={[1, -1, 1]} rotation={[-Math.PI / 2, 0, 0]}>
			<meshBasicMaterial transparent map={resources.renderTarget.texture} opacity={opacity} depthWrite={depthWrite} />
		</mesh>
		<orthographicCamera ref={shadowCamera} args={[-width / 2, width / 2, height / 2, -height / 2, near, far]} />
	</group>
}
