import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
	createUniversalRoot,
	defineUniversalComponent,
	universalActivity,
	universalKey,
	universalList,
	universalPlan,
	universalProps,
	universalValue,
} from 'octane/universal';
import { applyProps, extend } from '@octanejs/three';
import {
	createThreeContainer,
	createThreeDriver,
	getThreeInstance,
	type ThreeHostEnvironment,
} from '../src/core/driver.js';

function createRoot(scene = new THREE.Scene(), environment: ThreeHostEnvironment = {}) {
	const container = createThreeContainer({
		scene,
		environment: {
			// Disposal is deliberately drained through the public headless helper.
			scheduleDispose() {},
			...environment,
		},
	});
	const root = createUniversalRoot(container, createThreeDriver());
	return { container, root, scene };
}

describe('Three universal driver', () => {
	it('preserves real child objects and order while recreating a parent under one descriptor', () => {
		const meshPlan = universalPlan('three', {
			kind: 'host',
			type: 'mesh',
			propsSlot: 0,
		});
		const groupPlan = universalPlan('three', {
			kind: 'host',
			type: 'group',
			propsSlot: 0,
			children: [{ kind: 'slot', slot: 1 }],
		});
		const refs: Array<THREE.Group | null> = [];
		const updates: THREE.Group[] = [];
		const ref = (value: THREE.Group | null) => refs.push(value);
		const onUpdate = (value: THREE.Group) => updates.push(value);
		const Scene = defineUniversalComponent(
			'three',
			(props: { args: readonly number[]; order: readonly string[]; x: number }) =>
				universalValue(groupPlan, [
					universalProps([
						['set', 'args', props.args],
						['set', 'name', `parent-${props.x}`],
						['set', 'onUpdate', onUpdate],
						['set', 'ref', ref],
					]),
					universalList(props.order, (name) =>
						universalKey(
							name,
							universalValue(meshPlan, [
								universalProps([
									['set', 'name', name],
									['set', 'position', [props.x, 0, 0]],
								]),
							]),
						),
					),
				]),
		);
		const firstArgs = [1] as const;
		const secondArgs = [2] as const;
		let invalidations = 0;
		const { container, root, scene } = createRoot(new THREE.Scene(), {
			invalidate() {
				invalidations++;
			},
		});

		root.render(Scene, { args: firstArgs, order: ['a', 'b'], x: 1 });
		const firstParent = scene.children[0] as THREE.Group;
		const [meshA, meshB] = firstParent.children as THREE.Mesh[];
		const descriptor = getThreeInstance(firstParent);
		expect(firstParent).toBeInstanceOf(THREE.Group);
		expect(firstParent.children.map((child) => child.name)).toEqual(['a', 'b']);
		expect(meshA.position.x).toBe(1);
		expect(descriptor?.object).toBe(firstParent);
		expect(descriptor?.root).toBe(container);
		expect(descriptor?.parent).toBeNull();
		expect(descriptor?.children.map((child) => child.object)).toEqual([meshA, meshB]);
		expect(Object.isFrozen(descriptor)).toBe(true);
		expect(Object.isFrozen(descriptor?.props)).toBe(true);
		expect(refs).toEqual([firstParent]);
		expect(updates).toEqual([firstParent]);

		invalidations = 0;
		expect(applyProps(firstParent, { position: [3, 0, 0] })).toBe(firstParent);
		expect(firstParent.position.x).toBe(3);
		expect(invalidations).toBe(1);

		root.render(Scene, { args: firstArgs, order: ['b', 'a'], x: 4 });
		expect(scene.children[0]).toBe(firstParent);
		expect(firstParent.children).toEqual([meshB, meshA]);
		expect(meshA.position.x).toBe(4);
		expect(meshB.position.x).toBe(4);
		expect(getThreeInstance(firstParent)).toBe(descriptor);
		expect(descriptor?.children.map((child) => child.object)).toEqual([meshB, meshA]);
		expect(refs).toEqual([firstParent]);
		expect(updates).toEqual([firstParent, firstParent]);

		root.render(Scene, { args: secondArgs, order: ['b', 'a'], x: 5 });
		const replacement = scene.children[0] as THREE.Group;
		expect(replacement).not.toBe(firstParent);
		expect(replacement.children).toEqual([meshB, meshA]);
		expect(meshA.position.x).toBe(5);
		expect(getThreeInstance(replacement)).toBe(descriptor);
		expect(descriptor?.object).toBe(replacement);
		expect(getThreeInstance(firstParent)).toBeNull();
		expect(refs).toEqual([firstParent, null, replacement]);
		expect(updates).toEqual([firstParent, firstParent, replacement]);

		root.unmount();
		container.flushDisposals();
		expect(descriptor?.parent).toBeNull();
		expect(descriptor?.children).toEqual([]);
		expect(refs.at(-1)).toBeNull();
	});

	it('restores automatic and string attachments while explicit null suppresses attachment', () => {
		const primitivePlan = universalPlan('three', {
			kind: 'host',
			type: 'primitive',
			propsSlot: 0,
			children: [{ kind: 'slot', slot: 1 }],
		});
		const geometryPlan = universalPlan('three', {
			kind: 'host',
			type: 'boxGeometry',
			propsSlot: 0,
		});
		const materialPlan = universalPlan('three', {
			kind: 'host',
			type: 'meshBasicMaterial',
			propsSlot: 0,
		});
		const colorPlan = universalPlan('three', {
			kind: 'host',
			type: 'color',
			propsSlot: 0,
		});
		const suppressedPlan = universalPlan('three', {
			kind: 'host',
			type: 'sphereGeometry',
			propsSlot: 0,
		});
		const originalGeometry = new THREE.BufferGeometry();
		const originalMaterial = new THREE.MeshBasicMaterial();
		const mesh = new THREE.Mesh(originalGeometry, originalMaterial);
		mesh.userData.accent = 'original';
		let geometry: THREE.BoxGeometry | null = null;
		let material: THREE.MeshBasicMaterial | null = null;
		let accent: THREE.Color | null = null;
		let suppressed: THREE.SphereGeometry | null = null;
		const children = [
			{
				key: 'geometry',
				value: universalValue(geometryPlan, [
					universalProps([
						['set', 'args', [2, 3, 4]],
						['set', 'ref', (value: THREE.BoxGeometry | null) => (geometry = value)],
					]),
				]),
			},
			{
				key: 'material',
				value: universalValue(materialPlan, [
					universalProps([
						['set', 'color', 'hotpink'],
						['set', 'ref', (value: THREE.MeshBasicMaterial | null) => (material = value)],
					]),
				]),
			},
			{
				key: 'accent',
				value: universalValue(colorPlan, [
					universalProps([
						['set', 'args', ['royalblue']],
						['set', 'attach', 'userData-accent'],
						['set', 'ref', (value: THREE.Color | null) => (accent = value)],
					]),
				]),
			},
			{
				key: 'suppressed',
				value: universalValue(suppressedPlan, [
					universalProps([
						['set', 'attach', null],
						['set', 'ref', (value: THREE.SphereGeometry | null) => (suppressed = value)],
					]),
				]),
			},
		];
		const Scene = defineUniversalComponent('three', (props: { attached: boolean }) =>
			universalValue(primitivePlan, [
				universalProps([['set', 'object', mesh]]),
				universalList(props.attached ? children : [], (child) =>
					universalKey(child.key, child.value),
				),
			]),
		);
		let invalidations = 0;
		const { container, root, scene } = createRoot(new THREE.Scene(), {
			invalidate() {
				invalidations++;
			},
		});

		root.render(Scene, { attached: true });
		const attachedGeometry = geometry;
		const attachedMaterial = material;
		const attachedAccent = accent;
		const unattachedGeometry = suppressed;
		expect(scene.children).toEqual([mesh]);
		expect(attachedGeometry).toBeInstanceOf(THREE.BoxGeometry);
		expect(attachedMaterial).toBeInstanceOf(THREE.MeshBasicMaterial);
		expect(attachedAccent).toBeInstanceOf(THREE.Color);
		expect(unattachedGeometry).toBeInstanceOf(THREE.SphereGeometry);
		expect(mesh.geometry).toBe(attachedGeometry);
		expect(mesh.material).toBe(attachedMaterial);
		expect(mesh.userData.accent).toBe(attachedAccent);
		expect(mesh.geometry).not.toBe(unattachedGeometry);

		invalidations = 0;
		const managedTexture = new THREE.Texture();
		applyProps(attachedMaterial!, { map: managedTexture });
		expect(managedTexture.colorSpace).toBe(THREE.SRGBColorSpace);
		expect(invalidations).toBe(1);

		root.render(Scene, { attached: false });
		expect(mesh.geometry).toBe(originalGeometry);
		expect(mesh.material).toBe(originalMaterial);
		expect(mesh.userData.accent).toBe('original');
		expect(geometry).toBeNull();
		expect(material).toBeNull();
		expect(accent).toBeNull();
		expect(suppressed).toBeNull();

		root.unmount();
		container.flushDisposals();
	});

	it('disconnects function attachments and object visibility while retained, then reconnects them', () => {
		const retainedPlan = universalPlan('three', {
			kind: 'range',
			children: [
				{ kind: 'host', type: 'object3D', propsSlot: 0 },
				{ kind: 'host', type: 'object3D', propsSlot: 1 },
			],
		});
		const groupPlan = universalPlan('three', {
			kind: 'host',
			type: 'group',
			children: [{ kind: 'slot', slot: 0 }],
		});
		const log: string[] = [];
		let normal: THREE.Object3D | null = null;
		let tool: THREE.Object3D | null = null;
		const attach = (parentValue: unknown, selfValue: unknown) => {
			const parent = parentValue as THREE.Group;
			const self = selfValue as THREE.Object3D;
			log.push('attach');
			parent.userData.tool = self;
			return () => {
				log.push('cleanup');
				if (parent.userData.tool === self) delete parent.userData.tool;
			};
		};
		const Scene = defineUniversalComponent('three', (props: { mode: 'visible' | 'hidden' }) =>
			universalValue(groupPlan, [
				universalActivity(props.mode, () =>
					universalValue(retainedPlan, [
						universalProps([
							['set', 'name', 'normal'],
							['set', 'ref', (value: THREE.Object3D | null) => (normal = value)],
						]),
						universalProps([
							['set', 'name', 'tool'],
							['set', 'attach', attach],
							['set', 'ref', (value: THREE.Object3D | null) => (tool = value)],
						]),
					]),
				),
			]),
		);
		const { container, root, scene } = createRoot();

		root.render(Scene, { mode: 'hidden' });
		const parent = scene.children[0] as THREE.Group;
		const normalObject = normal as unknown as THREE.Object3D;
		const toolObject = tool as unknown as THREE.Object3D;
		expect(parent.children).toEqual([normalObject]);
		expect(normalObject.visible).toBe(false);
		expect(parent.userData.tool).toBeUndefined();
		expect(log).toEqual([]);

		root.render(Scene, { mode: 'visible' });
		expect(normal).toBe(normalObject);
		expect(tool).toBe(toolObject);
		expect(normalObject.visible).toBe(true);
		expect(parent.userData.tool).toBe(toolObject);
		expect(log).toEqual(['attach']);

		root.render(Scene, { mode: 'hidden' });
		expect(normal).toBe(normalObject);
		expect(tool).toBe(toolObject);
		expect(parent.children).toEqual([normalObject]);
		expect(normalObject.visible).toBe(false);
		expect(parent.userData.tool).toBeUndefined();
		expect(log).toEqual(['attach', 'cleanup']);

		root.render(Scene, { mode: 'visible' });
		expect(normal).toBe(normalObject);
		expect(tool).toBe(toolObject);
		expect(normalObject.visible).toBe(true);
		expect(parent.userData.tool).toBe(toolObject);
		expect(log).toEqual(['attach', 'cleanup', 'attach']);

		root.unmount();
		container.flushDisposals();
		expect(log).toEqual(['attach', 'cleanup', 'attach', 'cleanup']);
	});

	it('never disposes primitives and propagates dispose null through an owned subtree', () => {
		const disposals: string[] = [];
		class MilestoneDisposable extends THREE.Object3D {
			constructor(label: string) {
				super();
				this.name = label;
			}

			dispose() {
				disposals.push(this.name);
			}
		}
		extend({ MilestoneDisposable });
		const treePlan = universalPlan('three', {
			kind: 'range',
			children: [
				{
					kind: 'host',
					type: 'milestoneDisposable',
					propsSlot: 0,
					children: [{ kind: 'host', type: 'milestoneDisposable', propsSlot: 1 }],
				},
				{ kind: 'host', type: 'milestoneDisposable', propsSlot: 2 },
				{ kind: 'host', type: 'primitive', propsSlot: 3 },
			],
		});
		const external = new MilestoneDisposable('primitive');
		const Scene = defineUniversalComponent('three', () =>
			universalValue(treePlan, [
				universalProps([
					['set', 'args', ['protected-parent']],
					['set', 'dispose', null],
				]),
				universalProps([['set', 'args', ['protected-child']]]),
				universalProps([['set', 'args', ['normal']]]),
				universalProps([['set', 'object', external]]),
			]),
		);
		const { container, root, scene } = createRoot();

		root.render(Scene, undefined);
		expect(scene.children.map((child) => child.name)).toEqual([
			'protected-parent',
			'normal',
			'primitive',
		]);
		root.unmount();
		expect(disposals).toEqual([]);

		container.flushDisposals();
		expect(disposals).toEqual(['normal']);
	});

	it('disposes an abandoned staged object exactly once without publishing it', () => {
		let constructions = 0;
		let disposals = 0;
		class MilestoneStaged extends THREE.Object3D {
			constructor() {
				super();
				constructions++;
			}

			dispose() {
				disposals++;
			}
		}
		extend({ MilestoneStaged });
		const plan = universalPlan('three', { kind: 'host', type: 'milestoneStaged' });
		const Scene = defineUniversalComponent('three', () => universalValue(plan));
		const { container, root, scene } = createRoot();

		const attempt = root.prepare(Scene, undefined);
		expect(attempt.status).toBe('prepared');
		expect(constructions).toBe(1);
		expect(scene.children).toEqual([]);
		expect(container.instanceCount).toBe(0);
		attempt.abort();
		attempt.abort();
		expect(disposals).toBe(1);
		expect(scene.children).toEqual([]);
		expect(container.instanceCount).toBe(0);
		root.unmount();
	});

	it('isolates preparation and attachment-path failures and cleans staged objects', () => {
		let constructions = 0;
		let disposals = 0;
		class MilestonePreparationResource extends THREE.Object3D {
			broken = 0;

			constructor() {
				super();
				constructions++;
			}

			dispose() {
				disposals++;
			}
		}
		extend({ MilestonePreparationResource });
		const childPlan = universalPlan('three', {
			kind: 'host',
			type: 'milestonePreparationResource',
			propsSlot: 0,
		});
		const parentPlan = universalPlan('three', {
			kind: 'host',
			type: 'group',
			propsSlot: 0,
			children: [{ kind: 'slot', slot: 1 }],
		});
		const Scene = defineUniversalComponent('three', (props: { fail: 'none' | 'prop' | 'attach' }) =>
			universalValue(parentPlan, [
				universalProps([['set', 'name', 'committed']]),
				universalList(
					props.fail === 'prop' ? [0, 1] : props.fail === 'attach' ? [2] : [],
					(index) =>
						universalKey(
							index,
							universalValue(childPlan, [
								universalProps(
									index === 0
										? [['set', 'name', 'valid']]
										: index === 1
											? [['set', 'broken-value', 1]]
											: [
													['set', 'name', 'invalid-attachment'],
													['set', 'attach', 'broken-value'],
												],
								),
							]),
						),
				),
			]),
		);
		const { container, root, scene } = createRoot();

		root.render(Scene, { fail: 'none' });
		const committed = scene.children[0] as THREE.Group;
		expect(committed.children).toEqual([]);
		expect(container.instanceCount).toBe(1);

		expect(() => root.prepare(Scene, { fail: 'prop' })).toThrow(/Cannot set/);
		expect(constructions).toBe(2);
		expect(disposals).toBe(2);
		expect(scene.children).toEqual([committed]);
		expect(committed.children).toEqual([]);
		expect(container.instanceCount).toBe(1);
		expect(container.commits).toHaveLength(1);

		expect(() => root.prepare(Scene, { fail: 'attach' })).toThrow(/Cannot attach/);
		expect(constructions).toBe(3);
		expect(disposals).toBe(3);
		expect(scene.children).toEqual([committed]);
		expect(committed.children).toEqual([]);
		expect(container.instanceCount).toBe(1);
		expect(container.commits).toHaveLength(1);

		root.render(Scene, { fail: 'none' });
		expect(scene.children).toEqual([committed]);
		root.unmount();
		container.flushDisposals();
	});

	it('validates a new attachment against committed parent setter updates', () => {
		class MilestoneAttachmentParent extends THREE.Object3D {
			readonly accent = new THREE.Color('red');
		}
		extend({ MilestoneAttachmentParent });
		const colorPlan = universalPlan('three', {
			kind: 'host',
			type: 'color',
			propsSlot: 0,
		});
		const parentPlan = universalPlan('three', {
			kind: 'host',
			type: 'milestoneAttachmentParent',
			propsSlot: 0,
			children: [{ kind: 'slot', slot: 1 }],
		});
		const Scene = defineUniversalComponent(
			'three',
			(props: { accent: THREE.ColorRepresentation; child: boolean }) =>
				universalValue(parentPlan, [
					universalProps([['set', 'accent', props.accent]]),
					universalList(props.child ? ['accent'] : [], (key) =>
						universalKey(
							key,
							universalValue(colorPlan, [
								universalProps([
									['set', 'args', ['white']],
									['set', 'attach', 'accent-r'],
								]),
							]),
						),
					),
				]),
		);
		const { container, root, scene } = createRoot();

		root.render(Scene, { accent: 'red', child: false });
		const parent = scene.children[0] as MilestoneAttachmentParent;
		const accent = parent.accent;

		expect(() => root.render(Scene, { accent: 'blue', child: true })).not.toThrow();
		expect(parent.accent).toBe(accent);
		expect(parent.accent.r).toBeInstanceOf(THREE.Color);

		root.unmount();
		container.flushDisposals();
	});

	it('preserves dashed-key precedence and authored patch order during attachment validation', () => {
		class MilestoneAttachmentOverlay extends THREE.Object3D {
			foo: { bar: unknown } = { bar: {} };
			order: { leaf: unknown } = { leaf: {} };
			'foo-bar': unknown = 'literal';
		}
		extend({ MilestoneAttachmentOverlay });
		const colorPlan = universalPlan('three', {
			kind: 'host',
			type: 'color',
			propsSlot: 0,
		});
		const parentPlan = universalPlan('three', {
			kind: 'host',
			type: 'milestoneAttachmentOverlay',
			propsSlot: 0,
			children: [{ kind: 'slot', slot: 1 }],
		});
		type SceneProps = {
			child: 'direct' | 'ordered' | null;
			direct: unknown;
			foo: { bar: unknown };
			orderedLeaf: unknown;
			orderedRoot: { leaf: unknown };
		};
		const Scene = defineUniversalComponent('three', (props: SceneProps) =>
			universalValue(parentPlan, [
				universalProps([
					['set', 'foo', props.foo],
					['set', 'foo-bar', props.direct],
					// Descendant-before-root order is observable when both values change.
					['set', 'order-leaf', props.orderedLeaf],
					['set', 'order', props.orderedRoot],
				]),
				universalList(props.child === null ? [] : [props.child], (kind) =>
					universalKey(
						kind,
						universalValue(colorPlan, [
							universalProps([
								['set', 'args', ['white']],
								['set', 'attach', kind === 'direct' ? 'foo-bar-child' : 'order-leaf-child'],
							]),
						]),
					),
				),
			]),
		);
		const { container, root, scene } = createRoot();
		const initialFoo = { bar: {} as Record<string, unknown> };
		const initialOrder = { leaf: {} as Record<string, unknown> };
		const initialOrderedLeaf = {};
		const initialProps: SceneProps = {
			child: null,
			direct: 'literal',
			foo: initialFoo,
			orderedLeaf: initialOrderedLeaf,
			orderedRoot: initialOrder,
		};

		root.render(Scene, initialProps);
		const parent = scene.children[0] as MilestoneAttachmentOverlay;

		root.render(Scene, { ...initialProps, child: 'direct', direct: 1 });
		expect(parent['foo-bar']).toBe(1);
		expect((initialFoo.bar as Record<string, unknown>).child).toBeInstanceOf(THREE.Color);

		const scalarFoo = { bar: 0 };
		root.render(Scene, {
			...initialProps,
			child: null,
			direct: 1,
			foo: scalarFoo,
		});
		expect(() =>
			root.prepare(Scene, {
				...initialProps,
				child: 'direct',
				direct: {},
				foo: scalarFoo,
			}),
		).toThrow(/Cannot attach/);
		expect(parent['foo-bar']).toBe(1);
		expect(parent.foo).toBe(scalarFoo);

		const invalidOrderedLeaf = {};
		const invalidOrderedRoot = { leaf: 0 };
		expect(() =>
			root.prepare(Scene, {
				...initialProps,
				child: 'ordered',
				direct: 1,
				foo: scalarFoo,
				orderedLeaf: invalidOrderedLeaf,
				orderedRoot: invalidOrderedRoot,
			}),
		).toThrow(/Cannot attach/);
		expect(parent.order).toBe(initialOrder);

		const validOrderedRoot = { leaf: {} as Record<string, unknown> };
		root.render(Scene, {
			...initialProps,
			child: 'ordered',
			direct: 1,
			foo: scalarFoo,
			orderedLeaf: 0,
			orderedRoot: validOrderedRoot,
		});
		expect(parent.order).toBe(validOrderedRoot);
		expect(validOrderedRoot.leaf.child).toBeInstanceOf(THREE.Color);

		root.unmount();
		container.flushDisposals();
	});

	it('rejects an unknowable nested custom-setter attachment before mutation', () => {
		class ShapeChangingValue {
			child: unknown = { leaf: {} };

			set(_value: number) {
				this.child = 0;
				return this;
			}
		}
		class MilestoneCustomSetterParent extends THREE.Object3D {
			readonly custom = new ShapeChangingValue();
		}
		extend({ MilestoneCustomSetterParent });
		const colorPlan = universalPlan('three', {
			kind: 'host',
			type: 'color',
			propsSlot: 0,
		});
		const parentPlan = universalPlan('three', {
			kind: 'host',
			type: 'milestoneCustomSetterParent',
			propsSlot: 0,
			children: [{ kind: 'slot', slot: 1 }],
		});
		const Scene = defineUniversalComponent('three', (props: { apply: boolean; child: boolean }) =>
			universalValue(parentPlan, [
				universalProps(props.apply ? [['set', 'custom', 1]] : []),
				universalList(props.child ? ['child'] : [], (key) =>
					universalKey(
						key,
						universalValue(colorPlan, [
							universalProps([
								['set', 'args', ['white']],
								['set', 'attach', 'custom-child-leaf'],
							]),
						]),
					),
				),
			]),
		);
		const { container, root, scene } = createRoot();

		root.render(Scene, { apply: false, child: false });
		const parent = scene.children[0] as MilestoneCustomSetterParent;
		const originalChild = parent.custom.child;

		expect(() => root.prepare(Scene, { apply: true, child: true })).toThrow(
			/custom setter makes its final parent shape uncertain/,
		);
		expect(parent.custom.child).toBe(originalChild);

		root.unmount();
		container.flushDisposals();
	});

	it('rejects behavior-changing method and accessor writes before mutation', () => {
		class MilestoneDynamicWriteParent extends THREE.Object3D {
			private slotValue: unknown = {};

			get slot(): unknown {
				return this.slotValue;
			}

			set slot(_value: unknown) {
				this.slotValue = 0;
			}
		}
		extend({ MilestoneDynamicWriteParent });
		const colorPlan = universalPlan('three', {
			kind: 'host',
			type: 'color',
			propsSlot: 0,
		});
		const parentPlan = universalPlan('three', {
			kind: 'host',
			type: 'milestoneDynamicWriteParent',
			propsSlot: 0,
			children: [{ kind: 'slot', slot: 1 }],
		});
		const Scene = defineUniversalComponent(
			'three',
			(props: { mode: 'none' | 'method' | 'accessor' }) =>
				universalValue(parentPlan, [
					universalProps(
						props.mode === 'method'
							? [
									['set', 'position-set', null],
									['set', 'position', 1],
								]
							: props.mode === 'accessor'
								? [['set', 'slot', {}]]
								: [],
					),
					universalList(props.mode === 'none' ? [] : [props.mode], (mode) =>
						universalKey(
							mode,
							universalValue(colorPlan, [
								universalProps([
									['set', 'args', ['white']],
									['set', 'attach', mode === 'method' ? 'position-x' : 'slot-child'],
								]),
							]),
						),
					),
				]),
		);
		const { container, root, scene } = createRoot();

		root.render(Scene, { mode: 'none' });
		const parent = scene.children[0] as MilestoneDynamicWriteParent;
		const position = parent.position;
		const setPosition = position.set;
		const slot = parent.slot;

		expect(() => root.prepare(Scene, { mode: 'method' })).toThrow(/Cannot attach/);
		expect(parent.position).toBe(position);
		expect(parent.position.set).toBe(setPosition);

		expect(() => root.prepare(Scene, { mode: 'accessor' })).toThrow(/Cannot attach/);
		expect(parent.slot).toBe(slot);

		root.unmount();
		container.flushDisposals();
	});
});
