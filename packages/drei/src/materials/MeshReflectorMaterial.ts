import { Matrix4, MeshStandardMaterial, Texture } from 'three';

type Uniform<Value> = { value: Value | null };

export class MeshReflectorMaterialImpl extends MeshStandardMaterial {
	private _tDepth: Uniform<Texture> = { value: null };
	private _distortionMap: Uniform<Texture> = { value: null };
	private _tDiffuse: Uniform<Texture> = { value: null };
	private _tDiffuseBlur: Uniform<Texture> = { value: null };
	private _textureMatrix: Uniform<Matrix4> = { value: null };
	private _hasBlur = { value: false };
	private _mirror = { value: 0 };
	private _mixBlur = { value: 0 };
	private _mixStrength = { value: 0.5 };
	private _minDepthThreshold = { value: 0.9 };
	private _maxDepthThreshold = { value: 1 };
	private _depthScale = { value: 0 };
	private _depthToBlurRatioBias = { value: 0.25 };
	private _distortion = { value: 1 };
	private _mixContrast = { value: 1 };
	constructor(parameters = {}) {
		super(parameters);
		this.setValues(parameters);
	}
	override onBeforeCompile(shader: any): void {
		shader.defines ??= {};
		if (!shader.defines.USE_UV) shader.defines.USE_UV = '';
		Object.assign(shader.uniforms, {
			hasBlur: this._hasBlur,
			tDiffuse: this._tDiffuse,
			tDepth: this._tDepth,
			distortionMap: this._distortionMap,
			tDiffuseBlur: this._tDiffuseBlur,
			textureMatrix: this._textureMatrix,
			mirror: this._mirror,
			mixBlur: this._mixBlur,
			mixStrength: this._mixStrength,
			minDepthThreshold: this._minDepthThreshold,
			maxDepthThreshold: this._maxDepthThreshold,
			depthScale: this._depthScale,
			depthToBlurRatioBias: this._depthToBlurRatioBias,
			distortion: this._distortion,
			mixContrast: this._mixContrast,
		});
		shader.vertexShader =
			`uniform mat4 textureMatrix; varying vec4 my_vUv; ${shader.vertexShader}`.replace(
				'#include <project_vertex>',
				'#include <project_vertex>\nmy_vUv = textureMatrix * vec4(position, 1.0);\ngl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);',
			);
		shader.fragmentShader = `uniform sampler2D tDiffuse; uniform sampler2D tDiffuseBlur; uniform sampler2D tDepth;
uniform sampler2D distortionMap; uniform float distortion; uniform float cameraNear; uniform float cameraFar; uniform bool hasBlur;
uniform float mixBlur; uniform float mirror; uniform float mixStrength; uniform float minDepthThreshold; uniform float maxDepthThreshold;
uniform float mixContrast; uniform float depthScale; uniform float depthToBlurRatioBias; varying vec4 my_vUv; ${shader.fragmentShader}`;
		shader.fragmentShader = shader.fragmentShader.replace(
			'#include <emissivemap_fragment>',
			`#include <emissivemap_fragment>
float distortionFactor = 0.0;
#ifdef USE_DISTORTION
distortionFactor = texture2D(distortionMap, vUv).r * distortion;
#endif
vec4 new_vUv = my_vUv; new_vUv.xy += distortionFactor;
vec4 base = texture2DProj(tDiffuse, new_vUv); vec4 blur = texture2DProj(tDiffuseBlur, new_vUv); vec4 merge = base;
#ifdef USE_NORMALMAP
vec4 normalColor = texture2D(normalMap, vUv * normalScale);
vec3 my_normal = normalize(vec3(normalColor.r * 2.0 - 1.0, normalColor.b, normalColor.g * 2.0 - 1.0));
vec3 coord = new_vUv.xyz / new_vUv.w; vec2 normal_uv = coord.xy + coord.z * my_normal.xz * 0.05;
merge = texture2D(tDiffuse, normal_uv); blur = texture2D(tDiffuseBlur, normal_uv);
#endif
float depthFactor = 0.0001; float blurFactor = 0.0;
#ifdef USE_DEPTH
vec4 depth = texture2DProj(tDepth, new_vUv); depthFactor = smoothstep(minDepthThreshold, maxDepthThreshold, 1.0-(depth.r * depth.a));
depthFactor = max(0.0001, min(1.0, depthFactor * depthScale));
#ifdef USE_BLUR
blur *= min(1.0, depthFactor + depthToBlurRatioBias); merge *= min(1.0, depthFactor + 0.5);
#else
merge *= depthFactor;
#endif
#endif
float reflectorRoughnessFactor = roughness;
#ifdef USE_ROUGHNESSMAP
reflectorRoughnessFactor *= texture2D(roughnessMap, vUv).g;
#endif
#ifdef USE_BLUR
blurFactor = min(1.0, mixBlur * reflectorRoughnessFactor); merge = mix(merge, blur, blurFactor);
#endif
vec4 newMerge = vec4((merge.rgb - 0.5) * mixContrast + 0.5, 1.0);
diffuseColor.rgb *= ((1.0 - min(1.0, mirror)) + newMerge.rgb * mixStrength);`,
		);
	}
	get tDiffuse() {
		return this._tDiffuse.value;
	}
	set tDiffuse(value) {
		this._tDiffuse.value = value;
	}
	get tDepth() {
		return this._tDepth.value;
	}
	set tDepth(value) {
		this._tDepth.value = value;
	}
	get distortionMap() {
		return this._distortionMap.value;
	}
	set distortionMap(value) {
		this._distortionMap.value = value;
	}
	get tDiffuseBlur() {
		return this._tDiffuseBlur.value;
	}
	set tDiffuseBlur(value) {
		this._tDiffuseBlur.value = value;
	}
	get textureMatrix() {
		return this._textureMatrix.value;
	}
	set textureMatrix(value) {
		this._textureMatrix.value = value;
	}
	get hasBlur() {
		return this._hasBlur.value;
	}
	set hasBlur(value) {
		this._hasBlur.value = value;
	}
	get mirror() {
		return this._mirror.value;
	}
	set mirror(value) {
		this._mirror.value = value;
	}
	get mixBlur() {
		return this._mixBlur.value;
	}
	set mixBlur(value) {
		this._mixBlur.value = value;
	}
	get mixStrength() {
		return this._mixStrength.value;
	}
	set mixStrength(value) {
		this._mixStrength.value = value;
	}
	get minDepthThreshold() {
		return this._minDepthThreshold.value;
	}
	set minDepthThreshold(value) {
		this._minDepthThreshold.value = value;
	}
	get maxDepthThreshold() {
		return this._maxDepthThreshold.value;
	}
	set maxDepthThreshold(value) {
		this._maxDepthThreshold.value = value;
	}
	get depthScale() {
		return this._depthScale.value;
	}
	set depthScale(value) {
		this._depthScale.value = value;
	}
	get depthToBlurRatioBias() {
		return this._depthToBlurRatioBias.value;
	}
	set depthToBlurRatioBias(value) {
		this._depthToBlurRatioBias.value = value;
	}
	get distortion() {
		return this._distortion.value;
	}
	set distortion(value) {
		this._distortion.value = value;
	}
	get mixContrast() {
		return this._mixContrast.value;
	}
	set mixContrast(value) {
		this._mixContrast.value = value;
	}
}
