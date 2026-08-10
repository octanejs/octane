import { describe, expect, it, vi } from 'vitest';
import {
	calculateScaleFactor as calculateReactScaleFactor,
	meshBounds as reactMeshBounds,
	shaderMaterial as reactShaderMaterial,
} from '@react-three/drei';
import {
	BoxGeometry,
	Color,
	type Intersection,
	Mesh,
	MeshBasicMaterial,
	OrthographicCamera,
	PerspectiveCamera,
	Raycaster,
	ShaderMaterial,
	Vector3,
} from 'three';
import { calculateScaleFactor, meshBounds, shaderMaterial } from '../src/core/index.js';

const size = { width: 800, height: 600, top: 0, left: 0 };

describe('framework-neutral core utilities', () => {
	it.each([
		['perspective', new PerspectiveCamera(50, size.width / size.height, 0.1, 100)],
		['orthographic', new OrthographicCamera(-4, 4, 3, -3, 0.1, 100)],
	] as const)('matches Drei screen-space scaling for a %s camera', (_name, camera) => {
		camera.position.set(0, 0, 10);
		camera.lookAt(0, 0, 0);
		const point = new Vector3(1, -0.5, 0);

		const expected = calculateReactScaleFactor(point, 24, camera, size);
		const actual = calculateScaleFactor(point, 24, camera, size);

		expect(actual).toBeCloseTo(expected, 12);
		expect(point.toArray()).toEqual([1, -0.5, 0]);
		expect(calculateScaleFactor(point, 0, camera, size)).toBeCloseTo(
			calculateReactScaleFactor(point, 0, camera, size),
			12,
		);
	});

	it('matches Drei bounds intersections and miss behavior', () => {
		const geometry = new BoxGeometry(2, 2, 2);
		geometry.computeBoundingBox();
		const mesh = new Mesh(geometry, new MeshBasicMaterial());
		mesh.updateMatrixWorld(true);
		const raycaster = new Raycaster(new Vector3(0, 0, 5), new Vector3(0, 0, -1));
		const expected: Intersection[] = [];
		const actual: Intersection[] = [];

		reactMeshBounds.call(mesh, raycaster, expected);
		meshBounds.call(mesh, raycaster, actual);

		expect(actual).toHaveLength(1);
		expect(actual[0]?.distance).toBeCloseTo(expected[0]!.distance, 12);
		expect(actual[0]?.point.toArray()).toEqual(expected[0]!.point.toArray());
		expect(actual[0]?.object).toBe(mesh);

		const miss = new Raycaster(new Vector3(5, 5, 5), new Vector3(1, 0, 0));
		const misses: Intersection[] = [];
		meshBounds.call(mesh, miss, misses);
		expect(misses).toEqual([]);
	});

	it('matches Drei lazy bounds setup and ignores meshes without a material', () => {
		const geometry = new BoxGeometry(2, 2, 2);
		geometry.boundingSphere = null;
		const mesh = new Mesh(geometry, new MeshBasicMaterial());
		mesh.updateMatrixWorld(true);
		const raycaster = new Raycaster(new Vector3(0, 0, 5), new Vector3(0, 0, -1));
		const intersections: Intersection[] = [];

		meshBounds.call(mesh, raycaster, intersections);
		expect(geometry.boundingSphere).not.toBeNull();
		expect(intersections).toHaveLength(1);

		mesh.material = undefined as never;
		const ignored: Intersection[] = [];
		meshBounds.call(mesh, raycaster, ignored);
		expect(ignored).toEqual([]);
	});

	it('matches Drei shader uniforms, cloning, accessors, parameters, and initialization', () => {
		const vertexShader = 'void main() { gl_Position = vec4(0.0); }';
		const fragmentShader = 'void main() { gl_FragColor = vec4(1.0); }';
		const reactInit = vi.fn();
		const octaneInit = vi.fn();
		const defaults = { amount: 1, tint: new Color('red') };
		const ReactMaterial = reactShaderMaterial(defaults, vertexShader, fragmentShader, reactInit);
		const OctaneMaterial = shaderMaterial(defaults, vertexShader, fragmentShader, octaneInit);
		const react = new ReactMaterial({ transparent: true });
		const octane = new OctaneMaterial({ transparent: true });

		expect(octane).toBeInstanceOf(ShaderMaterial);
		expect({
			vertexShader: octane.vertexShader,
			fragmentShader: octane.fragmentShader,
			transparent: octane.transparent,
			amount: octane.amount,
			tint: octane.tint.getHex(),
		}).toEqual({
			vertexShader: react.vertexShader,
			fragmentShader: react.fragmentShader,
			transparent: react.transparent,
			amount: react.amount,
			tint: react.tint.getHex(),
		});
		expect(octaneInit).toHaveBeenCalledOnce();
		expect(octaneInit).toHaveBeenCalledWith(octane);
		expect(reactInit).toHaveBeenCalledOnce();

		octane.amount = 4;
		expect(octane.uniforms.amount?.value).toBe(4);
		expect(octane.amount).toBe(4);

		const second = new OctaneMaterial();
		expect(second.uniforms).not.toBe(octane.uniforms);
		expect(second.tint).not.toBe(octane.tint);
		expect(second.amount).toBe(1);
		expect(typeof OctaneMaterial.key).toBe('string');
		expect(OctaneMaterial.key).not.toBe(ReactMaterial.key);
	});
});
