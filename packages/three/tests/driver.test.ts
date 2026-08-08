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

function createRootReorderScene() {
	const mesh = universalPlan('three', {
		kind: 'host',
		type: 'mesh',
		propsSlot: 0,
	});
	return defineUniversalComponent(
		'three',
		(props: { order: readonly string[]; position: number }) =>
			universalList(props.order, (name) =>
				universalKey(
					name,
					universalValue(mesh, [
						universalProps([
							['set', 'name', name],
							['set', 'position', [props.position, 0, 0]],
						]),
					]),
				),
			),
	);
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

	it('keeps staged root replacements private and disposes abandoned replacements exactly once', () => {
		const constructed: FlatPreparedResource[] = [];
		const disposals: string[] = [];
		class FlatPreparedResource extends THREE.Object3D {
			constructor(id: string, generation: number) {
				super();
				this.name = `${id}:${generation}`;
				constructed.push(this);
			}

			dispose() {
				disposals.push(this.name);
			}
		}
		extend({ FlatPreparedResource });
		const resource = universalPlan('three', {
			kind: 'host',
			type: 'flatPreparedResource',
			propsSlot: 0,
		});
		const refValues = new Map<string, FlatPreparedResource | null>();
		const refA = (value: FlatPreparedResource | null) => refValues.set('a', value);
		const refB = (value: FlatPreparedResource | null) => refValues.set('b', value);
		const Scene = defineUniversalComponent('three', (props: { generation: number }) =>
			universalList(['a', 'b'], (id) =>
				universalKey(
					id,
					universalValue(resource, [
						universalProps([
							['set', 'args', [id, props.generation]],
							['set', 'ref', id === 'a' ? refA : refB],
						]),
					]),
				),
			),
		);
		const { container, root, scene } = createRoot();

		root.render(Scene, { generation: 0 });
		const original = [...scene.children] as FlatPreparedResource[];
		const descriptors = original.map((object) => getThreeInstance(object));
		const abandoned = root.prepare(Scene, { generation: 1 });
		expect(scene.children).toEqual(original);
		expect(container.instanceCount).toBe(2);
		expect(constructed.slice(2).every((object) => getThreeInstance(object) === null)).toBe(true);
		expect(refValues.get('a')).toBe(original[0]);
		expect(refValues.get('b')).toBe(original[1]);
		expect(disposals).toEqual([]);

		abandoned.abort();
		abandoned.abort();
		expect(disposals).toEqual(['a:1', 'b:1']);
		expect(scene.children).toEqual(original);
		expect(original.map((object) => getThreeInstance(object))).toEqual(descriptors);

		root.render(Scene, { generation: 2 });
		const replacement = [...scene.children] as FlatPreparedResource[];
		expect(replacement.map((object) => object.name)).toEqual(['a:2', 'b:2']);
		expect(replacement[0]).not.toBe(original[0]);
		expect(replacement[1]).not.toBe(original[1]);
		expect(replacement.map((object) => getThreeInstance(object))).toEqual(descriptors);
		expect(original.map((object) => getThreeInstance(object))).toEqual([null, null]);
		expect(refValues.get('a')).toBe(replacement[0]);
		expect(refValues.get('b')).toBe(replacement[1]);
		expect(disposals).toEqual(['a:1', 'b:1']);

		container.flushDisposals();
		expect(disposals).toEqual(['a:1', 'b:1', 'a:0', 'b:0']);
		root.unmount();
		container.flushDisposals();
		expect(disposals).toEqual(['a:1', 'b:1', 'a:0', 'b:0', 'a:2', 'b:2']);
	});

	it('keeps committed root objects intact when a later replacement constructor fails', () => {
		const disposals: string[] = [];
		class FlatFailingResource extends THREE.Object3D {
			constructor(id: string, generation: number) {
				super();
				this.name = `${id}:${generation}`;
				if (id === 'b' && generation === 1) throw new Error('replacement construction failed');
			}

			dispose() {
				disposals.push(this.name);
			}
		}
		extend({ FlatFailingResource });
		const resource = universalPlan('three', {
			kind: 'host',
			type: 'flatFailingResource',
			propsSlot: 0,
		});
		const Scene = defineUniversalComponent('three', (props: { generation: number }) =>
			universalList(['a', 'b'], (id) =>
				universalKey(
					id,
					universalValue(resource, [universalProps([['set', 'args', [id, props.generation]]])]),
				),
			),
		);
		const { container, root, scene } = createRoot();

		root.render(Scene, { generation: 0 });
		const committed = [...scene.children];
		expect(() => root.prepare(Scene, { generation: 1 })).toThrow('replacement construction failed');
		expect(disposals).toEqual(['a:1']);
		expect(scene.children).toEqual(committed);
		expect(container.instanceCount).toBe(2);
		expect(committed.every((object) => getThreeInstance(object) !== null)).toBe(true);
		expect(container.commits).toHaveLength(1);

		root.render(Scene, { generation: 2 });
		expect(scene.children.map((object) => object.name)).toEqual(['a:2', 'b:2']);
		container.flushDisposals();
		expect(disposals).toEqual(['a:1', 'a:0', 'b:0']);
		root.unmount();
		container.flushDisposals();
	});

	it('finishes an accepted root reconstruction after a child removal listener throws', () => {
		const disposals: string[] = [];
		class FlatAcceptedReplacement extends THREE.Object3D {
			constructor(id: string, generation: number) {
				super();
				this.name = `${id}:${generation}`;
			}

			dispose() {
				disposals.push(this.name);
			}
		}
		extend({ FlatAcceptedReplacement });
		const replacement = universalPlan('three', {
			kind: 'host',
			type: 'flatAcceptedReplacement',
			propsSlot: 0,
		});
		const refValues = new Map<string, FlatAcceptedReplacement | null>();
		const refA = (value: FlatAcceptedReplacement | null) => refValues.set('a', value);
		const refB = (value: FlatAcceptedReplacement | null) => refValues.set('b', value);
		const Scene = defineUniversalComponent('three', (props: { generation: number }) =>
			universalList(['a', 'b'], (id) =>
				universalKey(
					id,
					universalValue(replacement, [
						universalProps([
							['set', 'args', [id, props.generation]],
							['set', 'ref', id === 'a' ? refA : refB],
						]),
					]),
				),
			),
		);
		const { container, root, scene } = createRoot();
		root.render(Scene, { generation: 0 });
		const original = [...scene.children];
		let shouldFail = true;
		original[0].addEventListener('removed', () => {
			if (!shouldFail) return;
			shouldFail = false;
			throw new Error('accepted child removal failed');
		});

		expect(() => root.render(Scene, { generation: 1 })).toThrow('accepted child removal failed');
		expect(scene.children.map((object) => object.name)).toEqual(['a:1', 'b:1']);
		expect(container.instanceCount).toBe(2);
		expect(original.map((object) => getThreeInstance(object))).toEqual([null, null]);
		expect(refValues.get('a')).toBe(scene.children[0]);
		expect(refValues.get('b')).toBe(scene.children[1]);
		expect(container.commits).toHaveLength(2);
		expect(disposals).toEqual([]);

		container.flushDisposals();
		expect(disposals).toEqual(['a:0', 'b:0']);
		root.unmount();
		container.flushDisposals();
	});

	it('delivers child lifecycle events while replacing constructor-backed root objects', () => {
		const events: string[] = [];
		class FlatObservedReplacement extends THREE.Object3D {
			constructor(id: string, generation: number) {
				super();
				this.name = `${id}:${generation}`;
				if (generation !== 0) {
					this.addEventListener('added', () => events.push(`added:${this.name}`));
				}
			}
		}
		extend({ FlatObservedReplacement });
		const observed = universalPlan('three', {
			kind: 'host',
			type: 'flatObservedReplacement',
			propsSlot: 0,
		});
		const Scene = defineUniversalComponent('three', (props: { generation: number }) =>
			universalList(['a', 'b'], (id) =>
				universalKey(
					id,
					universalValue(observed, [universalProps([['set', 'args', [id, props.generation]]])]),
				),
			),
		);
		const { container, root, scene } = createRoot();
		root.render(Scene, { generation: 0 });
		for (const child of scene.children) {
			child.addEventListener('removed', () => events.push(`removed:${child.name}`));
		}

		root.render(Scene, { generation: 1 });
		expect(scene.children.map((child) => child.name)).toEqual(['a:1', 'b:1']);
		expect(events).toEqual(['removed:a:0', 'removed:b:0', 'added:a:1', 'added:b:1']);

		root.unmount();
		container.flushDisposals();
	});

	it('uses public scene placement overrides while mounting and replacing root objects', () => {
		const operations: string[] = [];
		class ObservedScene extends THREE.Scene {
			override add(...objects: THREE.Object3D[]): this {
				for (const object of objects) operations.push(`add:${object.name}`);
				return super.add(...objects);
			}

			override remove(...objects: THREE.Object3D[]): this {
				for (const object of objects) operations.push(`remove:${object.name}`);
				return super.remove(...objects);
			}
		}
		class FlatOverriddenReplacement extends THREE.Object3D {
			constructor(id: string, generation: number) {
				super();
				this.name = `${id}:${generation}`;
			}
		}
		extend({ FlatOverriddenReplacement });
		const observed = universalPlan('three', {
			kind: 'host',
			type: 'flatOverriddenReplacement',
			propsSlot: 0,
		});
		const Scene = defineUniversalComponent('three', (props: { generation: number }) =>
			universalList(['a', 'b'], (id) =>
				universalKey(
					id,
					universalValue(observed, [universalProps([['set', 'args', [id, props.generation]]])]),
				),
			),
		);
		const { container, root, scene } = createRoot(new ObservedScene());
		root.render(Scene, { generation: 0 });
		expect(operations).toEqual(['add:a:0', 'add:b:0']);
		operations.length = 0;

		root.render(Scene, { generation: 1 });
		expect(scene.children.map((child) => child.name)).toEqual(['a:1', 'b:1']);
		expect(operations).toEqual(['remove:a:0', 'remove:b:0', 'add:a:1', 'add:b:1']);

		root.unmount();
		container.flushDisposals();
	});

	it('observes scene placement overrides installed after a root mesh mount is prepared', () => {
		const mesh = universalPlan('three', {
			kind: 'host',
			type: 'mesh',
			propsSlot: 0,
		});
		const Scene = defineUniversalComponent('three', () =>
			universalValue(mesh, [
				universalProps([
					['set', 'name', 'prepared-mesh'],
					['set', 'position', [1, 0, 0]],
				]),
			]),
		);
		const { container, root, scene } = createRoot();
		const observed: string[] = [];
		const prepared = root.prepare(Scene, undefined);
		if (prepared.status !== 'prepared') throw new Error('Expected a prepared root mount.');
		const add = scene.add;
		Object.defineProperty(scene, 'add', {
			configurable: true,
			value(object: THREE.Object3D) {
				observed.push(object.name);
				return add.call(this, object);
			},
		});

		prepared.commit();
		expect(scene.children.map((child) => child.name)).toEqual(['prepared-mesh']);
		expect(observed).toEqual(['prepared-mesh']);

		root.unmount();
		container.flushDisposals();
	});

	it('observes child listeners and scene overrides installed after reconstruction is prepared', () => {
		const constructed: FlatLateObservedReplacement[] = [];
		const observed: string[] = [];
		class FlatLateObservedReplacement extends THREE.Object3D {
			constructor(id: string, generation: number) {
				super();
				this.name = `${id}:${generation}`;
				constructed.push(this);
			}
		}
		extend({ FlatLateObservedReplacement });
		const resource = universalPlan('three', {
			kind: 'host',
			type: 'flatLateObservedReplacement',
			propsSlot: 0,
		});
		const Scene = defineUniversalComponent('three', (props: { generation: number }) =>
			universalList(['a', 'b'], (id) =>
				universalKey(
					id,
					universalValue(resource, [universalProps([['set', 'args', [id, props.generation]]])]),
				),
			),
		);
		const { container, root, scene } = createRoot();
		root.render(Scene, { generation: 0 });
		const originals = [...scene.children];
		const prepared = root.prepare(Scene, { generation: 1 });
		if (prepared.status !== 'prepared') throw new Error('Expected a prepared reconstruction.');
		const replacements = constructed.slice(2);
		originals[0].addEventListener('removed', () => observed.push('removed:a:0'));
		replacements[1].addEventListener('added', () => observed.push('added:b:1'));

		prepared.commit();
		expect(scene.children).toEqual(replacements);
		expect(observed).toEqual(['removed:a:0', 'added:b:1']);

		const second = root.prepare(Scene, { generation: 2 });
		if (second.status !== 'prepared') throw new Error('Expected a second prepared reconstruction.');
		const remove = scene.remove;
		Object.defineProperty(scene, 'remove', {
			configurable: true,
			value(object: THREE.Object3D) {
				observed.push(`override:${object.name}`);
				return remove.call(this, object);
			},
		});
		second.commit();
		expect(scene.children.map((object) => object.name)).toEqual(['a:2', 'b:2']);
		expect(observed).toEqual(['removed:a:0', 'added:b:1', 'override:a:1', 'override:b:1']);

		root.unmount();
		container.flushDisposals();
	});

	it('completes accepted root cleanup and ownership release after a child listener throws', () => {
		const disposals: string[] = [];
		class FlatAcceptedRemoval extends THREE.Object3D {
			constructor(id: string) {
				super();
				this.name = id;
			}

			dispose() {
				disposals.push(this.name);
			}
		}
		extend({ FlatAcceptedRemoval });
		const removable = universalPlan('three', {
			kind: 'host',
			type: 'flatAcceptedRemoval',
			propsSlot: 0,
		});
		const refValues = new Map<string, FlatAcceptedRemoval | null>();
		const refA = (value: FlatAcceptedRemoval | null) => refValues.set('a', value);
		const refB = (value: FlatAcceptedRemoval | null) => refValues.set('b', value);
		const Scene = defineUniversalComponent('three', (props: { present: boolean }) =>
			universalList(props.present ? ['a', 'b'] : [], (id) =>
				universalKey(
					id,
					universalValue(removable, [
						universalProps([
							['set', 'args', [id]],
							['set', 'ref', id === 'a' ? refA : refB],
						]),
					]),
				),
			),
		);
		const { container, root, scene } = createRoot();
		root.render(Scene, { present: true });
		const original = [...scene.children];
		let shouldFail = true;
		original[0].addEventListener('removed', () => {
			if (!shouldFail) return;
			shouldFail = false;
			throw new Error('accepted root cleanup failed');
		});

		expect(() => root.render(Scene, { present: false })).toThrow('accepted root cleanup failed');
		expect(scene.children).toEqual([]);
		expect(container.instanceCount).toBe(0);
		expect(original.map((object) => getThreeInstance(object))).toEqual([null, null]);
		expect(refValues.get('a')).toBeNull();
		expect(refValues.get('b')).toBeNull();
		expect(container.commits).toHaveLength(2);
		expect(disposals).toEqual([]);

		container.flushDisposals();
		expect(disposals).toEqual(['a', 'b']);
		root.render(Scene, { present: true });
		expect(scene.children.map((object) => object.name)).toEqual(['a', 'b']);
		root.unmount();
		container.flushDisposals();
	});

	it('preserves keyed root identities and refs while reordering and updating their properties', () => {
		const mesh = universalPlan('three', {
			kind: 'host',
			type: 'mesh',
			propsSlot: 0,
		});
		const refLog: string[] = [];
		const refs = new Map(
			['a', 'b', 'c', 'd'].map((id) => [
				id,
				(value: THREE.Mesh | null) => refLog.push(`${id}:${value === null ? 'clear' : 'set'}`),
			]),
		);
		const Scene = defineUniversalComponent(
			'three',
			(props: { items: readonly { id: string; x: number }[] }) =>
				universalList(props.items, (item) =>
					universalKey(
						item.id,
						universalValue(mesh, [
							universalProps([
								['set', 'name', item.id],
								['set', 'position', [item.x, 0, 0]],
								['set', 'ref', refs.get(item.id)!],
							]),
						]),
					),
				),
		);
		const { container, root, scene } = createRoot();
		const initial = [
			{ id: 'a', x: 1 },
			{ id: 'b', x: 2 },
			{ id: 'c', x: 3 },
			{ id: 'd', x: 4 },
		];
		root.render(Scene, { items: initial });
		const objects = new Map(scene.children.map((object) => [object.name, object]));
		refLog.length = 0;
		const reordered = [
			{ id: 'd', x: 40 },
			{ id: 'b', x: 20 },
			{ id: 'a', x: 10 },
			{ id: 'c', x: 30 },
		];

		const abandoned = root.prepare(Scene, { items: reordered });
		expect(scene.children.map((object) => object.name)).toEqual(['a', 'b', 'c', 'd']);
		expect(scene.children.map((object) => object.position.x)).toEqual([1, 2, 3, 4]);
		abandoned.abort();
		expect(refLog).toEqual([]);

		root.render(Scene, { items: reordered });
		expect(scene.children.map((object) => object.name)).toEqual(['d', 'b', 'a', 'c']);
		expect(scene.children.map((object) => object.position.x)).toEqual([40, 20, 10, 30]);
		for (const object of scene.children) expect(object).toBe(objects.get(object.name));
		expect(refLog).toEqual([]);

		root.unmount();
		container.flushDisposals();
	});

	it('honors scene placement overrides installed after directly mounting root meshes', () => {
		const Scene = createRootReorderScene();
		const { container, root, scene } = createRoot();
		root.render(Scene, { order: ['a', 'b', 'c'], position: 0 });
		const objects = new Map(scene.children.map((object) => [object.name, object]));
		const observed: string[] = [];
		const originalAdd = scene.add;
		const originalRemove = scene.remove;
		Object.defineProperties(scene, {
			add: {
				configurable: true,
				value(...children: THREE.Object3D[]) {
					for (const child of children) observed.push(`add:${child.name}`);
					return originalAdd.apply(this, children);
				},
			},
			remove: {
				configurable: true,
				value(...children: THREE.Object3D[]) {
					for (const child of children) observed.push(`remove:${child.name}`);
					return originalRemove.apply(this, children);
				},
			},
		});

		root.render(Scene, { order: ['c', 'a', 'b'], position: 4 });

		expect(scene.children.map((object) => object.name)).toEqual(['c', 'a', 'b']);
		expect(scene.children.map((object) => object.position.x)).toEqual([4, 4, 4]);
		for (const object of scene.children) expect(object).toBe(objects.get(object.name));
		expect(observed).toEqual(['add:c', 'remove:c', 'add:a', 'remove:a', 'add:b', 'remove:b']);

		root.unmount();
		container.flushDisposals();
	});

	it('observes scene placement overrides installed after a root reorder is prepared', () => {
		const Scene = createRootReorderScene();
		const { container, root, scene } = createRoot();
		root.render(Scene, { order: ['a', 'b', 'c'], position: 0 });
		const prepared = root.prepare(Scene, { order: ['b', 'c', 'a'], position: 2 });
		if (prepared.status !== 'prepared') throw new Error('Expected a prepared root reorder.');
		const observed: string[] = [];
		const originalAdd = scene.add;
		Object.defineProperty(scene, 'add', {
			configurable: true,
			value(...children: THREE.Object3D[]) {
				for (const child of children) observed.push(child.name);
				return originalAdd.apply(this, children);
			},
		});
		expect(scene.children.map((object) => object.name)).toEqual(['a', 'b', 'c']);
		expect(observed).toEqual([]);

		prepared.commit();

		expect(scene.children.map((object) => object.name)).toEqual(['b', 'c', 'a']);
		expect(scene.children.map((object) => object.position.x)).toEqual([2, 2, 2]);
		expect(observed).toEqual(['b', 'c', 'a']);

		root.unmount();
		container.flushDisposals();
	});

	it('preserves protected and external ownership when clearing root objects', () => {
		const disposals: string[] = [];
		class FlatOwnedResource extends THREE.Object3D {
			constructor(id: string) {
				super();
				this.name = id;
			}

			dispose() {
				disposals.push(this.name);
			}
		}
		extend({ FlatOwnedResource });
		const owned = universalPlan('three', {
			kind: 'host',
			type: 'flatOwnedResource',
			propsSlot: 0,
		});
		const primitive = universalPlan('three', {
			kind: 'host',
			type: 'primitive',
			propsSlot: 0,
		});
		const external = new FlatOwnedResource('external');
		const refValues = new Map<string, THREE.Object3D | null>();
		const references = new Map(
			['owned', 'protected', 'external'].map((id) => [
				id,
				(value: THREE.Object3D | null) => refValues.set(id, value),
			]),
		);
		const Scene = defineUniversalComponent('three', (props: { present: boolean }) =>
			universalList(props.present ? ['owned', 'protected', 'external'] : [], (id) =>
				universalKey(
					id,
					universalValue(id === 'external' ? primitive : owned, [
						universalProps(
							id === 'external'
								? [
										['set', 'object', external],
										['set', 'ref', references.get(id)!],
									]
								: id === 'protected'
									? [
											['set', 'args', [id]],
											['set', 'dispose', null],
											['set', 'ref', references.get(id)!],
										]
									: [
											['set', 'args', [id]],
											['set', 'ref', references.get(id)!],
										],
						),
					]),
				),
			),
		);
		const { container, root, scene } = createRoot();

		root.render(Scene, { present: true });
		const objects = [...scene.children];
		root.render(Scene, { present: false });
		expect(scene.children).toEqual([]);
		expect(container.instanceCount).toBe(0);
		expect(objects.map((object) => getThreeInstance(object))).toEqual([null, null, null]);
		expect([...refValues]).toEqual([
			['owned', null],
			['protected', null],
			['external', null],
		]);
		expect(disposals).toEqual([]);

		container.flushDisposals();
		expect(disposals).toEqual(['owned']);
		root.unmount();
	});

	it('defers disposal getters and observes disposal methods added after root removal', () => {
		class FlatDeferredResource extends THREE.Object3D {
			constructor(id: string) {
				super();
				this.name = id;
			}
		}
		extend({ FlatDeferredResource });
		const resource = universalPlan('three', {
			kind: 'host',
			type: 'flatDeferredResource',
			propsSlot: 0,
		});
		const Scene = defineUniversalComponent('three', (props: { present: boolean }) =>
			universalList(props.present ? ['throws', 'added-later'] : [], (id) =>
				universalKey(id, universalValue(resource, [universalProps([['set', 'args', [id]]])])),
			),
		);
		const { container, root, scene } = createRoot();
		root.render(Scene, { present: true });
		const [throwing, addedLater] = scene.children;
		let getterReads = 0;
		Object.defineProperty(throwing, 'dispose', {
			get() {
				getterReads++;
				throw new Error('deferred disposal getter failed');
			},
		});

		expect(() => root.render(Scene, { present: false })).not.toThrow();
		expect(getterReads).toBe(0);
		expect(scene.children).toEqual([]);
		expect(container.instanceCount).toBe(0);
		expect(getThreeInstance(throwing)).toBeNull();
		expect(getThreeInstance(addedLater)).toBeNull();
		let disposedLater = false;
		Object.defineProperty(addedLater, 'dispose', {
			value() {
				disposedLater = true;
			},
		});

		expect(() => container.flushDisposals()).toThrow('deferred disposal getter failed');
		expect(getterReads).toBe(1);
		expect(disposedLater).toBe(true);
		root.unmount();
	});

	it('reasserts externally mutated root order and visibility on a retained leaf update', () => {
		const meshPlan = universalPlan('three', {
			kind: 'host',
			type: 'mesh',
			propsSlot: 0,
		});
		const Scene = defineUniversalComponent(
			'three',
			(props: { items: readonly { id: string; x: number }[] }) =>
				universalList(props.items, (item) =>
					universalKey(
						item.id,
						universalValue(meshPlan, [
							universalProps([
								['set', 'name', item.id],
								['set', 'position', [item.x, 0, 0]],
							]),
						]),
					),
				),
		);
		const { container, root, scene } = createRoot();

		root.render(Scene, {
			items: [
				{ id: 'a', x: 0 },
				{ id: 'b', x: 1 },
			],
		});
		const [a, b] = scene.children as THREE.Mesh[];
		scene.add(a);
		a.visible = false;
		expect(scene.children).toEqual([b, a]);

		root.render(Scene, {
			items: [
				{ id: 'a', x: 2 },
				{ id: 'b', x: 3 },
			],
		});
		expect(scene.children).toEqual([a, b]);
		expect(a.visible).toBe(true);
		expect(a.position.x).toBe(2);
		expect(b.position.x).toBe(3);

		root.unmount();
		container.flushDisposals();
	});

	it('updates mesh positions without writing unchanged non-writable names', () => {
		const mesh = universalPlan('three', {
			kind: 'host',
			type: 'mesh',
			propsSlot: 0,
		});
		const Scene = defineUniversalComponent('three', (props: { name: string; x: number }) =>
			universalValue(mesh, [
				universalProps([
					['set', 'name', props.name],
					['set', 'position', [props.x, 0, 0]],
				]),
			]),
		);
		const { container, root, scene } = createRoot();
		root.render(Scene, { name: 'retained', x: 1 });
		const object = scene.children[0] as THREE.Mesh;
		Object.defineProperty(object, 'name', {
			configurable: true,
			enumerable: true,
			value: 'retained',
			writable: false,
		});

		expect(() => root.render(Scene, { name: 'retained', x: 2 })).not.toThrow();
		expect(object.position.x).toBe(2);
		expect(() => root.render(Scene, { name: 'changed', x: 3 })).toThrow();
		expect(object.name).toBe('retained');
		expect(object.position.x).toBe(2);

		root.unmount();
		container.flushDisposals();
	});

	it('falls back to the canonical vector setter after public method mutation', () => {
		const meshPlan = universalPlan('three', {
			kind: 'host',
			type: 'mesh',
			propsSlot: 0,
		});
		const Scene = defineUniversalComponent('three', (props: { x: number }) =>
			universalValue(meshPlan, [
				universalProps([
					['set', 'name', 'mutable-vector'],
					['set', 'position', [props.x, 0, 0]],
				]),
			]),
		);
		const { container, root, scene } = createRoot();

		root.render(Scene, { x: 1 });
		const mesh = scene.children[0] as THREE.Mesh;
		Object.defineProperty(mesh.position, 'fromArray', { value: null });
		expect(() => root.render(Scene, { x: 2 })).not.toThrow();
		expect(mesh.position.x).toBe(2);

		root.unmount();
		container.flushDisposals();
	});

	it('does not invoke authored array helpers while selecting the direct leaf path', () => {
		const meshPlan = universalPlan('three', {
			kind: 'host',
			type: 'mesh',
			propsSlot: 0,
		});
		const position = [4, 0, 0];
		Object.defineProperty(position, 'every', {
			value() {
				throw new Error('authored every must stay inert');
			},
		});
		const Scene = defineUniversalComponent('three', () =>
			universalValue(meshPlan, [
				universalProps([
					['set', 'name', 'safe-array'],
					['set', 'position', position],
				]),
			]),
		);
		const { container, root, scene } = createRoot();

		expect(() => root.render(Scene, undefined)).not.toThrow();
		expect(scene.children[0].position.x).toBe(4);

		root.unmount();
		container.flushDisposals();
	});

	it('checks catalogue overrides before staging a built-in direct leaf', () => {
		let constructions = 0;
		class Mesh extends THREE.Mesh {
			constructor() {
				super();
				constructions++;
				if (constructions > 1) throw new Error('constructed twice');
			}
		}
		extend({ Mesh });
		const meshPlan = universalPlan('three', {
			kind: 'host',
			type: 'mesh',
			propsSlot: 0,
		});
		const Scene = defineUniversalComponent('three', () =>
			universalValue(meshPlan, [
				universalProps([
					['set', 'name', 'custom-mesh'],
					['set', 'position', [1, 0, 0]],
				]),
			]),
		);
		const { container, root, scene } = createRoot();

		expect(() => root.render(Scene, undefined)).not.toThrow();
		expect(constructions).toBe(1);
		expect(scene.children[0]).toBeInstanceOf(Mesh);

		root.unmount();
		container.flushDisposals();
	});
});
