/** @jsxImportSource @octanejs/three/intrinsics */
import { type ThreeElements, type ThreeRef, useFrame } from '@octanejs/three';
import { useMemo, useState } from '@octanejs/three/renderer';
import * as THREE from 'three';

const distortShader = '#define GLSLIFY 1\nvec3 mod289(vec3 x){return x-floor(x*(1.0/289.0))*289.0;}vec4 mod289(vec4 x){return x-floor(x*(1.0/289.0))*289.0;}vec4 permute(vec4 x){return mod289(((x*34.0)+1.0)*x);}vec4 taylorInvSqrt(vec4 r){return 1.79284291400159-0.85373472095314*r;}float snoise(vec3 v){const vec2 C=vec2(1.0/6.0,1.0/3.0);const vec4 D=vec4(0.0,0.5,1.0,2.0);vec3 i=floor(v+dot(v,C.yyy));vec3 x0=v-i+dot(i,C.xxx);vec3 g=step(x0.yzx,x0.xyz);vec3 l=1.0-g;vec3 i1=min(g.xyz,l.zxy);vec3 i2=max(g.xyz,l.zxy);vec3 x1=x0-i1+C.xxx;vec3 x2=x0-i2+C.yyy;vec3 x3=x0-D.yyy;i=mod289(i);vec4 p=permute(permute(permute(i.z+vec4(0.0,i1.z,i2.z,1.0))+i.y+vec4(0.0,i1.y,i2.y,1.0))+i.x+vec4(0.0,i1.x,i2.x,1.0));float n_=0.142857142857;vec3 ns=n_*D.wyz-D.xzx;vec4 j=p-49.0*floor(p*ns.z*ns.z);vec4 x_=floor(j*ns.z);vec4 y_=floor(j-7.0*x_);vec4 x=x_*ns.x+ns.yyyy;vec4 y=y_*ns.x+ns.yyyy;vec4 h=1.0-abs(x)-abs(y);vec4 b0=vec4(x.xy,y.xy);vec4 b1=vec4(x.zw,y.zw);vec4 s0=floor(b0)*2.0+1.0;vec4 s1=floor(b1)*2.0+1.0;vec4 sh=-step(h,vec4(0.0));vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy;vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;vec3 p0=vec3(a0.xy,h.x);vec3 p1=vec3(a0.zw,h.y);vec3 p2=vec3(a1.xy,h.z);vec3 p3=vec3(a1.zw,h.w);vec4 norm=taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));p0*=norm.x;p1*=norm.y;p2*=norm.z;p3*=norm.w;vec4 m=max(0.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.0);m=m*m;return 42.0*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));}';

type Uniform<T> = { value: T };

export class DistortMaterialImpl extends THREE.MeshPhysicalMaterial {
	_time: Uniform<number> = { value: 0 };
	_distort: Uniform<number> = { value: 0.4 };
	_radius: Uniform<number> = { value: 1 };

	constructor(parameters: THREE.MeshPhysicalMaterialParameters = {}) {
		super(parameters);
		this.setValues(parameters);
	}

	override onBeforeCompile(shader: THREE.WebGLProgramParametersWithUniforms): void {
		shader.uniforms.time = this._time;
		shader.uniforms.radius = this._radius;
		shader.uniforms.distort = this._distort;
		shader.vertexShader = `uniform float time;\nuniform float radius;\nuniform float distort;\n${distortShader}\n${shader.vertexShader}`;
		shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', 'float updateTime = time / 50.0;\nfloat noise = snoise(vec3(position / 2.0 + updateTime * 5.0));\nvec3 transformed = vec3(position * (noise * pow(distort, 2.0) + radius));');
	}

	get time(): number { return this._time.value; }
	set time(value: number) { this._time.value = value; }
	get distort(): number { return this._distort.value; }
	set distort(value: number) { this._distort.value = value; }
	get radius(): number { return this._radius.value; }
	set radius(value: number) { this._radius.value = value; }
}

export class WobbleMaterialImpl extends THREE.MeshStandardMaterial {
	_time: Uniform<number> = { value: 0 };
	_factor: Uniform<number> = { value: 1 };

	constructor(parameters: THREE.MeshStandardMaterialParameters = {}) {
		super(parameters);
		this.setValues(parameters);
	}

	override onBeforeCompile(shader: THREE.WebGLProgramParametersWithUniforms): void {
		shader.uniforms.time = this._time;
		shader.uniforms.factor = this._factor;
		shader.vertexShader = `uniform float time;\nuniform float factor;\n${shader.vertexShader}`;
		shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', 'float theta = sin( time + position.y ) / 2.0 * factor;\nfloat c = cos( theta );\nfloat s = sin( theta );\nmat3 m = mat3( c, 0, s, 0, 1, 0, -s, 0, c );\nvec3 transformed = vec3( position ) * m;\nvNormal = vNormal * m;');
	}

	get time(): number { return this._time.value; }
	set time(value: number) { this._time.value = value; }
	get factor(): number { return this._factor.value; }
	set factor(value: number) { this._factor.value = value; }
}

export type MeshDistortMaterialProps = Omit<ThreeElements['meshPhysicalMaterial'], 'ref'> & {
	time?: number;
	distort?: number;
	radius?: number;
	speed?: number;
	factor?: number;
};

export function MeshDistortMaterial({ speed = 1, ref, ...props }: MeshDistortMaterialProps & {
	ref?: ThreeRef<DistortMaterialImpl>;
}) @{
	const [material] = useState(() => new DistortMaterialImpl());
	const mergedRef = useMemo(() => (value: DistortMaterialImpl | null) => assignRef(ref, value), [ref]);
	useFrame((state) => (material.time = state.clock.elapsedTime * speed));
	<primitive object={material} ref={mergedRef} attach="material" {...props as any} />
}

export type WobbleMaterialProps = Omit<ThreeElements['meshStandardMaterial'], 'ref'> & {
	speed?: number;
	factor?: number;
};

export function MeshWobbleMaterial({ speed = 1, ref, ...props }: WobbleMaterialProps & {
	ref?: ThreeRef<WobbleMaterialImpl>;
}) @{
	const [material] = useState(() => new WobbleMaterialImpl());
	const mergedRef = useMemo(() => (value: WobbleMaterialImpl | null) => assignRef(ref, value), [ref]);
	useFrame((state) => (material.time = state.clock.elapsedTime * speed));
	<primitive object={material} ref={mergedRef} attach="material" {...props as any} />
}

function assignRef<T>(ref: ThreeRef<T> | undefined, value: T | null): void {
	if (Array.isArray(ref)) for (const item of ref) assignRef(item, value);
	else if (typeof ref === 'function') ref(value);
	else if (ref && 'current' in ref) ref.current = value;
}
