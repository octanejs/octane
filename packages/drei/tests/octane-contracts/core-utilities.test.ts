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
import { calculateScaleFactor, meshBounds, shaderMaterial } from '../../src/core/index.js';

const size = { width: 800, height: 600, top: 0, left: 0 };

describe('framework-neutral core utilities (Octane-only contracts)', () => {
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
});
