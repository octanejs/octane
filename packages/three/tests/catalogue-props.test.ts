import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { applyProps, dispose, extend } from '@octanejs/three';
import {
	createThreeObject,
	registerThreeNamespace,
	validateThreeInstance,
} from '../src/core/catalogue.js';
import { attachString, detachAttachment, getEffectiveAttachment } from '../src/core/attach.js';
import { applyThreeProps } from '../src/core/props.js';

describe('@octanejs/three catalogue', () => {
	it('validates built-ins and preserves primitive identity and ownership', () => {
		registerThreeNamespace();

		expect(() => validateThreeInstance('missingEvidenceObject', {})).toThrow(
			'Call extend({ MissingEvidenceObject }) before rendering it.',
		);
		expect(() => validateThreeInstance('primitive', {})).toThrow(
			'Primitives without an object are invalid.',
		);
		expect(() => validateThreeInstance('mesh', { args: 'not-an-array' })).toThrow(
			'The args prop must be an array.',
		);

		const mesh = createThreeObject('mesh', {});
		expect(mesh.object).toBeInstanceOf(THREE.Mesh);
		expect(mesh.owned).toBe(true);
		expect(mesh.type).toBe('mesh');

		const object = new THREE.Group();
		const primitive = createThreeObject('primitive', { object });
		expect(primitive.object).toBe(object);
		expect(primitive.owned).toBe(false);
		expect(primitive.type).toBe('primitive');
	});

	it('supports catalogue and constructor forms of extend', () => {
		class CatalogueObject extends THREE.Object3D {
			constructor(readonly label: string) {
				super();
			}
		}

		expect(extend({ CatalogueObject })).toBeUndefined();
		const result = createThreeObject('catalogueObject', { args: ['catalogued'] });
		expect(result.object).toBeInstanceOf(CatalogueObject);
		expect(result.object.label).toBe('catalogued');

		class ComponentObject extends THREE.Object3D {}
		const Component = extend(ComponentObject);
		expect(typeof Component).toBe('function');
		expect(extend(ComponentObject)).toBe(Component);
	});
});

describe('@octanejs/three host observations', () => {
	it('applies Three math, color, pierced, and ordinary properties without leaking renderer props', () => {
		const material = new THREE.MeshBasicMaterial();
		const mesh = new THREE.Mesh(new THREE.BoxGeometry(), material);
		const onClick = vi.fn();
		const onUpdate = vi.fn();

		applyThreeProps(mesh, {
			position: [1, 2, 3],
			scale: 2,
			'material-color': '#ff00aa',
			visible: false,
			onClick,
			onUpdate,
			attach: 'ignored',
		});

		expect(mesh.position.toArray()).toEqual([1, 2, 3]);
		expect(mesh.scale.toArray()).toEqual([2, 2, 2]);
		expect(material.color.getHexString()).toBe('ff00aa');
		expect(mesh.visible).toBe(false);
		expect((mesh as THREE.Mesh & { onClick?: unknown }).onClick).toBeUndefined();
		expect(onClick).not.toHaveBeenCalled();
		expect(onUpdate).not.toHaveBeenCalled();

		applyThreeProps(mesh, {}, { position: [1, 2, 3], 'material-color': '#ff00aa' });
		expect(mesh.position.toArray()).toEqual([0, 0, 0]);
		expect(material.color.getHexString()).toBe('000000');
		expect((mesh as THREE.Mesh & { color?: unknown }).color).toBeUndefined();

		const directDash = { 'custom-value': 1, custom: { value: 2 } };
		applyThreeProps(directDash, { 'custom-value': 3 });
		expect(directDash).toEqual({ 'custom-value': 3, custom: { value: 2 } });

		const missingParent: Record<string, unknown> = {};
		expect(() => applyThreeProps(missingParent, { 'missing-value': 1 })).toThrow(
			'Ensure the parent is an object',
		);
		expect(missingParent).toEqual({});

		const unmanagedTexture = new THREE.Texture();
		applyProps(material, { map: unmanagedTexture });
		expect(unmanagedTexture.colorSpace).toBe(THREE.NoColorSpace);
	});

	it('automatically attaches geometry and material and restores authored parent values', () => {
		const originalGeometry = new THREE.BoxGeometry();
		const replacementGeometry = new THREE.SphereGeometry();
		const material = new THREE.MeshBasicMaterial();
		const mesh = new THREE.Mesh(originalGeometry, material);

		expect(getEffectiveAttachment(replacementGeometry)).toBe('geometry');
		expect(getEffectiveAttachment(material)).toBe('material');
		expect(getEffectiveAttachment(replacementGeometry, null)).toBeNull();

		const geometryAttachment = attachString(mesh, replacementGeometry, 'geometry');
		expect(mesh.geometry).toBe(replacementGeometry);
		detachAttachment(geometryAttachment);
		expect(mesh.geometry).toBe(originalGeometry);
		detachAttachment(geometryAttachment);
		expect(mesh.geometry).toBe(originalGeometry);

		const parent: { material?: THREE.Material[] } = {};
		const indexedAttachment = attachString(parent, material, 'material-0');
		expect(parent.material?.[0]).toBe(material);
		detachAttachment(indexedAttachment);
		expect(parent.material?.[0]).toBeUndefined();
	});

	it('disposes owned resources while preserving Scene-owned lifetimes', () => {
		const disposeObject = vi.fn();
		const disposeResource = vi.fn();
		const disposeScene = vi.fn();
		const object = {
			type: 'EvidenceObject',
			dispose: disposeObject,
			resource: { type: 'Texture', dispose: disposeResource },
			scene: { type: 'Scene', dispose: disposeScene },
		};

		dispose(object);

		expect(disposeObject).toHaveBeenCalledOnce();
		expect(disposeResource).toHaveBeenCalledOnce();
		expect(disposeScene).not.toHaveBeenCalled();
	});
});
