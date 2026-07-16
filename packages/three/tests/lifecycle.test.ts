import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
	createUniversalRoot,
	defineUniversalComponent,
	universalIf,
	universalKey,
	universalList,
	universalPlan,
	universalProps,
	universalValue,
} from 'octane/universal';
import { createThreeContainer, createThreeDriver } from '../src/core/driver.js';

function createRoot() {
	const scene = new THREE.Scene();
	const container = createThreeContainer({
		scene,
		environment: { scheduleDispose() {} },
	});
	const root = createUniversalRoot(container, createThreeDriver());
	return { container, root, scene };
}

describe('Three host lifecycle ordering', () => {
	it('orders function attachment, lifecycle, and refs across create, update, recreation, and removal', () => {
		const plan = universalPlan('three', {
			kind: 'host',
			type: 'group',
			propsSlot: 0,
		});
		const { container, root, scene } = createRoot();
		const labels = new WeakMap<THREE.Group, string>();
		let nextLabel = 1;
		let currentRef: THREE.Group | null = null;
		const log: string[] = [];
		const label = (object: THREE.Group) => {
			let value = labels.get(object);
			if (value === undefined) {
				value = `instance-${nextLabel++}`;
				labels.set(object, value);
			}
			return value;
		};
		const attach = (parentValue: unknown, selfValue: unknown) => {
			const parent = parentValue as THREE.Scene;
			const self = selfValue as THREE.Group;
			const identity = label(self);
			log.push(`attach:${identity}`);
			parent.userData.lifecycleObject = self;
			return () => {
				log.push(`cleanup:${identity}`);
				if (parent.userData.lifecycleObject === self) delete parent.userData.lifecycleObject;
			};
		};
		const onUpdate = (self: THREE.Group) => {
			const placement = scene.userData.lifecycleObject === self ? 'attached' : 'detached';
			log.push(`update:${label(self)}:${self.name}:${placement}`);
		};
		const ref = (self: THREE.Group | null) => {
			if (self === null) {
				log.push(`ref:null:${currentRef === null ? 'none' : label(currentRef)}`);
				currentRef = null;
				return;
			}
			currentRef = self;
			const placement = scene.userData.lifecycleObject === self ? 'attached' : 'detached';
			log.push(`ref:${label(self)}:${self.name}:${placement}`);
		};
		const Scene = defineUniversalComponent(
			'three',
			(props: { args: readonly number[]; name: string; visible: boolean }) =>
				universalIf(props.visible, () =>
					universalValue(plan, [
						universalProps([
							['set', 'args', props.args],
							['set', 'name', props.name],
							['set', 'attach', attach],
							['set', 'onUpdate', onUpdate],
							['set', 'ref', ref],
						]),
					]),
				),
		);
		const firstArgs = [1] as const;
		const secondArgs = [2] as const;

		root.render(Scene, { args: firstArgs, name: 'created', visible: true });
		const first = currentRef!;
		expect(log).toEqual([
			'attach:instance-1',
			'update:instance-1:created:attached',
			'ref:instance-1:created:attached',
		]);
		expect(scene.userData.lifecycleObject).toBe(first);

		log.length = 0;
		root.render(Scene, { args: firstArgs, name: 'updated', visible: true });
		expect(currentRef).toBe(first);
		expect(log).toEqual(['update:instance-1:updated:attached']);

		log.length = 0;
		root.render(Scene, { args: secondArgs, name: 'recreated', visible: true });
		const replacement = currentRef!;
		expect(replacement).not.toBe(first);
		expect(scene.userData.lifecycleObject).toBe(replacement);
		expect(log).toEqual([
			'cleanup:instance-1',
			'attach:instance-2',
			'ref:null:instance-1',
			'update:instance-2:recreated:attached',
			'ref:instance-2:recreated:attached',
		]);

		log.length = 0;
		root.render(Scene, { args: secondArgs, name: 'recreated', visible: false });
		expect(scene.userData.lifecycleObject).toBeUndefined();
		expect(currentRef).toBeNull();
		expect(log).toEqual(['cleanup:instance-2', 'ref:null:instance-2']);

		root.unmount();
		container.flushDisposals();
	});

	it('reruns attachment and lifecycle for a keyed move without ref churn', () => {
		const childPlan = universalPlan('three', {
			kind: 'host',
			type: 'group',
			propsSlot: 0,
		});
		const parentPlan = universalPlan('three', {
			kind: 'host',
			type: 'group',
			children: [{ kind: 'slot', slot: 0 }],
		});
		const { container, root } = createRoot();
		const log: string[] = [];
		const attach = (_parent: unknown, selfValue: unknown) => {
			const id = (selfValue as THREE.Group).name;
			log.push(`attach:${id}`);
			return () => log.push(`cleanup:${id}`);
		};
		const onUpdate = (self: THREE.Group) => log.push(`update:${self.name}`);
		const ref = (self: THREE.Group | null) =>
			log.push(self === null ? 'ref:null' : `ref:${self.name}`);
		const Scene = defineUniversalComponent('three', (props: { order: readonly string[] }) =>
			universalValue(parentPlan, [
				universalList(props.order, (id) =>
					universalKey(
						id,
						universalValue(childPlan, [
							universalProps([
								['set', 'name', id],
								['set', 'attach', attach],
								['set', 'onUpdate', onUpdate],
								['set', 'ref', ref],
							]),
						]),
					),
				),
			]),
		);

		root.render(Scene, { order: ['a', 'b'] });
		log.length = 0;
		root.render(Scene, { order: ['b', 'a'] });

		expect(log).toHaveLength(3);
		const moved = log[0].replace('cleanup:', '');
		expect(['a', 'b']).toContain(moved);
		expect(log).toEqual([`cleanup:${moved}`, `attach:${moved}`, `update:${moved}`]);

		root.unmount();
		container.flushDisposals();
	});
});
