import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { applyProps, dispose, extend } from '@octanejs/three';
import { createThreeTestRenderer } from '@octanejs/three/testing';
import { defineUniversalComponent, universalComponent, universalProps } from 'octane/universal';
import {
	createThreeObject,
	registerThreeIntrinsic,
	registerThreeNamespace,
	validateThreeInstance,
} from '../src/core/catalogue.js';
import { attachString, detachAttachment, getEffectiveAttachment } from '../src/core/attach.js';
import { applyThreeProps } from '../src/core/props.js';

describe('@octanejs/three catalogue', () => {
	it('registers built-in constructors selectively without replacing explicit extensions', () => {
		class SelectiveMesh extends THREE.Mesh {}
		class OverriddenMesh extends THREE.Mesh {}

		registerThreeIntrinsic('SelectiveMesh', SelectiveMesh);
		registerThreeIntrinsic('SelectiveMesh', THREE.Mesh);
		expect(createThreeObject('selectiveMesh', {}).object).toBeInstanceOf(SelectiveMesh);

		extend({ SelectiveMesh: OverriddenMesh });
		registerThreeIntrinsic('SelectiveMesh', SelectiveMesh);
		expect(createThreeObject('selectiveMesh', {}).object).toBeInstanceOf(OverriddenMesh);
	});

	it('retains explicit built-in overrides when the full Canvas catalogue is registered later', () => {
		class OverriddenMesh extends THREE.Mesh {}
		extend({ Mesh: OverriddenMesh });
		try {
			registerThreeNamespace();
			expect(createThreeObject('mesh', {}).object).toBeInstanceOf(OverriddenMesh);
		} finally {
			extend({ Mesh: THREE.Mesh });
		}
	});

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

		const prefixedLine = createThreeObject('threeLine', {});
		expect(prefixedLine.object).toBeInstanceOf(THREE.Line);
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

	it('preserves children, references, event handlers, and constructor identity on extended components', async () => {
		class ComponentMesh extends THREE.Mesh {
			constructor(readonly label: string) {
				super();
				this.name = label;
			}
		}
		const Component = extend(ComponentMesh);
		const refs: Array<ComponentMesh | null> = [];
		const pointerEvents: string[] = [];
		const ref = (value: ComponentMesh | null) => refs.push(value);
		const Scene = defineUniversalComponent('three', (props: { generation: number }) =>
			universalComponent(
				'three',
				Component,
				universalProps([
					['set', 'args', [`parent:${props.generation}`]],
					['set', 'ref', ref],
					['set', 'onPointerDown', () => pointerEvents.push(`parent:${props.generation}`)],
					[
						'set',
						'children',
						universalComponent(
							'three',
							Component,
							universalProps([['set', 'args', ['retained-child']]]),
						),
					],
				]),
			),
		);
		const root = await createThreeTestRenderer(Scene, { generation: 0 });

		try {
			const initial = root.scene.children[0] as ComponentMesh;
			const child = initial.children[0] as ComponentMesh;
			expect(initial).toBeInstanceOf(ComponentMesh);
			expect(child).toBeInstanceOf(ComponentMesh);
			expect(child.name).toBe('retained-child');
			expect(refs).toEqual([initial]);
			await root.fireEvent(initial, 'pointerDown');

			root.update(Scene, { generation: 1 });
			const replacement = root.scene.children[0] as ComponentMesh;
			expect(replacement).not.toBe(initial);
			expect(replacement.name).toBe('parent:1');
			expect(replacement.children).toEqual([child]);
			expect(refs).toEqual([initial, null, replacement]);
			await root.fireEvent(replacement, 'pointerDown');
			expect(pointerEvents).toEqual(['parent:0', 'parent:1']);
			expect(extend(ComponentMesh)).toBe(Component);
		} finally {
			root.unmount();
		}
	});
});

describe('@octanejs/three host observations', () => {
	// OCTANE DIVERGENCE[pierced-prop-reset-target][adapted:three-pierced-reset]
	// @parity-case adapted:three-pierced-reset
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

		const authored = Array.from({ length: 4 }, () => new THREE.MeshBasicMaterial());
		const replacements = Array.from({ length: 4 }, () => new THREE.MeshBasicMaterial());
		const arrayParent = { material: [...authored] };
		const attachments = replacements.map((replacement, index) =>
			attachString(arrayParent, replacement, `material-${index}`),
		);
		expect(arrayParent.material).toEqual(replacements);
		for (const attachment of attachments.toReversed()) detachAttachment(attachment);
		expect(arrayParent.material).toEqual(authored);
	});

	it('preserves shader uniform and math identities while filtering renderer-only props', () => {
		const shader = new THREE.ShaderMaterial({
			uniforms: {
				time: { value: 1 },
				tint: { value: new THREE.Color('red') },
			},
		});
		const uniforms = shader.uniforms;
		const time = uniforms.time;
		const tint = uniforms.tint;
		const nextTint = new THREE.Color('blue');

		applyProps(shader, {
			uniforms: {
				time: { value: 2 },
				tint: { value: nextTint },
				gain: { value: 3 },
			},
		});
		expect(shader.uniforms).toBe(uniforms);
		expect(shader.uniforms.time).toBe(time);
		expect(shader.uniforms.tint).toBe(tint);
		expect(shader.uniforms).toMatchObject({
			time: { value: 2 },
			tint: { value: nextTint },
			gain: { value: 3 },
		});

		applyProps(shader, { 'uniforms-time-value': 4 });
		expect(time.value).toBe(4);

		const mesh = new THREE.Mesh();
		const position = mesh.position;
		applyProps(mesh, { position: new THREE.Vector3(1, 2, 3), scale: [2, 3, 4] });
		expect(mesh.position).toBe(position);
		expect(mesh.position.toArray()).toEqual([1, 2, 3]);
		expect(mesh.scale.toArray()).toEqual([2, 3, 4]);

		const reserved = Object.defineProperties(
			{},
			{
				args: { enumerable: true, get: () => expect.fail('args getter was read') },
				onPointerDown: {
					enumerable: true,
					get: () => expect.fail('event getter was read'),
				},
			},
		);
		expect(() => applyProps(mesh, reserved)).not.toThrow();
		mesh.name = 'retained';
		applyProps(mesh, { name: undefined, customValue: 42 });
		expect(mesh.name).toBe('retained');
		expect((mesh as THREE.Mesh & { customValue?: number }).customValue).toBe(42);
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
